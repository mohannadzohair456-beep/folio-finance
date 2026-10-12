#!/usr/bin/env python3
"""Drive the installed Folio APK through adb.

The release APK is not modified. Buttons and fields are found from the
accessibility tree, with a screenshot OCR fallback when WebView text is
missing from that tree.
"""
import argparse
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PKG = "com.folio.finance.app"
ACTIVITY = PKG + "/com.folio.finance.MainActivity"


def normalized_label(text):
    cleaned = " ".join(str(text).split()).lower()
    cleaned = cleaned.replace("→", " ").replace("›", " ").replace("»", " ")
    return " ".join(cleaned.split()).strip(" .:-")


def is_control_label(text, needle):
    """True when the node is the control, not a sentence that mentions it."""
    return normalized_label(text) == normalized_label(needle)


class DriveError(Exception):
    pass


class Driver:
    def __init__(self, artifacts: Path):
        self.artifacts = artifacts
        self.artifacts.mkdir(parents=True, exist_ok=True)
        self.step = 0
        self.width, self.height = 1080, 1920

    def run(self, args, check=True, timeout=60):
        print("+", " ".join(args), flush=True)
        result = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
        if result.stdout:
            print(result.stdout[-2000:], flush=True)
        if result.stderr:
            print(result.stderr[-2000:], flush=True)
        if check and result.returncode != 0:
            raise DriveError("command failed: " + " ".join(args))
        return result

    def adb(self, *args, check=True, timeout=60):
        return self.run(["adb", *args], check=check, timeout=timeout)

    def shell(self, script, check=True, timeout=60):
        return self.adb("shell", script, check=check, timeout=timeout)

    def shot(self, name):
        self.step += 1
        path = self.artifacts / f"{self.step:02d}-{name}.png"
        raw = subprocess.run(["adb", "exec-out", "screencap", "-p"], capture_output=True, timeout=30)
        if raw.returncode != 0 or not raw.stdout.startswith(b"\x89PNG"):
            print("screencap failed", raw.returncode, raw.stderr[-200:], flush=True)
            return None
        path.write_bytes(raw.stdout)
        print("saved", path, flush=True)
        return path

    def save_text(self, name, text):
        path = self.artifacts / name
        path.write_text(text)
        print("saved", path, "bytes", len(text), flush=True)

    def read_size(self):
        result = self.shell("wm size", check=False)
        match = re.search(r"(\d+)x(\d+)", result.stdout or "")
        if match:
            self.width, self.height = int(match.group(1)), int(match.group(2))
        print("screen", self.width, self.height, flush=True)

    def wake(self):
        self.shell("input keyevent KEYCODE_WAKEUP", check=False)
        self.shell("wm dismiss-keyguard", check=False)
        self.shell("settings put global window_animation_scale 0", check=False)
        self.shell("settings put global transition_animation_scale 0", check=False)
        self.shell("settings put global animator_duration_scale 0", check=False)
        self.shell("settings put secure show_ime_with_hard_keyboard 0", check=False)

    def launch(self):
        self.shell("am force-stop " + PKG, check=False)
        self.adb("shell", "am", "start", "-n", ACTIVITY)
        time.sleep(2)

    def running(self):
        result = self.shell("pidof " + PKG, check=False)
        text = (result.stdout or "").strip()
        return bool(text) and text.split()[0].isdigit()

    def version_line(self):
        result = self.shell("dumpsys package " + PKG, check=False, timeout=40)
        text = result.stdout or ""
        code = re.search(r"versionCode=(\d+)", text)
        name = re.search(r"versionName=([^\s]+)", text)
        return (code.group(1) if code else "?"), (name.group(1) if name else "?")

    def dump_nodes(self):
        for _ in range(4):
            self.shell("uiautomator dump /sdcard/window_dump.xml", check=False, timeout=40)
            target = self.artifacts / "window_dump.xml"
            pulled = subprocess.run(
                ["adb", "pull", "/sdcard/window_dump.xml", str(target)],
                text=True, capture_output=True, timeout=30)
            if pulled.returncode == 0 and target.exists() and target.stat().st_size > 50:
                try:
                    root = ET.parse(target).getroot()
                except ET.ParseError:
                    time.sleep(1)
                    continue
                nodes = []
                for node in root.iter("node"):
                    text = (node.attrib.get("text") or "") + " " + (node.attrib.get("content-desc") or "")
                    text = " ".join(text.split())
                    bounds = node.attrib.get("bounds") or ""
                    match = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds)
                    if not match:
                        continue
                    x1, y1, x2, y2 = (int(match.group(i)) for i in range(1, 5))
                    if x2 <= x1 or y2 <= y1:
                        # WebView keeps off-screen rows at 0,0. The text still
                        # proves what was saved; these nodes are never tapped.
                        if text:
                            nodes.append({
                                "text": text,
                                "class": node.attrib.get("class") or "",
                                "clickable": False,
                                "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                                "cx": 0, "cy": -1,
                            })
                        continue
                    nodes.append({
                        "text": text,
                        "class": node.attrib.get("class") or "",
                        "clickable": node.attrib.get("clickable") == "true",
                        "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                        "cx": (x1 + x2) // 2, "cy": (y1 + y2) // 2,
                    })
                return nodes
            time.sleep(1)
        return []

    def ocr_nodes(self, image: Path):
        if image is None or not image.exists():
            return []
        tsv_path = image.with_suffix(".tsv")
        result = subprocess.run(
            ["tesseract", str(image), "stdout", "--psm", "6", "tsv"],
            text=True, capture_output=True, timeout=60)
        if result.returncode != 0:
            print("tesseract failed", result.stderr[-300:], flush=True)
            return []
        tsv_path.write_text(result.stdout or "")
        rows = []
        for line in (result.stdout or "").splitlines()[1:]:
            parts = line.split("\t")
            if len(parts) < 12:
                continue
            word = parts[11].strip()
            if not word or word == "-1":
                continue
            try:
                conf = float(parts[10])
                left, top, width, height = (int(parts[i]) for i in range(6, 10))
            except ValueError:
                continue
            if conf < 35 or width <= 0 or height <= 0:
                continue
            rows.append({
                "text": word,
                "class": "ocr",
                "clickable": False,
                "x1": left, "y1": top, "x2": left + width, "y2": top + height,
                "cx": left + width // 2, "cy": top + height // 2,
                "line": parts[7] if len(parts) > 7 else "0",
            })
        # Join words that share a Tesseract line so "Open Folio" is one target.
        grouped = {}
        for row in rows:
            grouped.setdefault(row["line"], []).append(row)
        lines = []
        for group in grouped.values():
            group.sort(key=lambda item: item["x1"])
            lines.append({
                "text": " ".join(item["text"] for item in group),
                "class": "ocr-line",
                "clickable": False,
                "x1": group[0]["x1"],
                "y1": min(item["y1"] for item in group),
                "x2": group[-1]["x2"],
                "y2": max(item["y2"] for item in group),
                "cx": (group[0]["x1"] + group[-1]["x2"]) // 2,
                "cy": (min(item["y1"] for item in group) + max(item["y2"] for item in group)) // 2,
            })
        return rows + lines

    def look(self, needle=None, forbid=()):
        ui = self.dump_nodes()
        if needle and self.candidates(ui, needle, forbid):
            print("nodes", "ui", len(ui), "ocr skipped", flush=True)
            return ui
        image = self.shot("screen")
        ocr = self.ocr_nodes(image)
        print("nodes", "ui", len(ui), "ocr", len(ocr), flush=True)
        return ui + ocr

    def blob(self, nodes):
        return "\n".join(node["text"] for node in nodes if node["text"])

    def swipe_up(self):
        x = self.width // 2
        self.shell(f"input swipe {x} {int(self.height * 0.72)} {x} {int(self.height * 0.28)} 350")
        time.sleep(0.6)

    def scroll_to_top(self):
        x = self.width // 2
        top = int(self.height * 0.28)
        bottom = int(self.height * 0.78)
        for _ in range(3):
            self.shell(f"input swipe {x} {top} {x} {bottom} 250")
            time.sleep(0.35)

    def collect(self, scrolls=3):
        self.scroll_to_top()
        pieces = []
        for _ in range(scrolls + 1):
            pieces.append(self.blob(self.look()))
            self.swipe_up()
        return "\n".join(pieces)

    def visible(self, node):
        if node["x2"] - node["x1"] < 24 or node["y2"] - node["y1"] < 24:
            return False
        return 0 <= node["cx"] <= self.width and 0 <= node["cy"] <= self.height

    def control_ready(self, node, needle):
        """A content button under the mobile nav is only a sliver; scroll it up."""
        if not self.visible(node):
            return False
        if normalized_label(needle) in {"home", "activity", "insights", "budgets", "settings", "overview", "budget"}:
            return True
        return node["cy"] < self.height - 260

    def bring_into_view(self, needle, scrolls=4):
        for _ in range(scrolls + 1):
            nodes = self.dump_nodes()
            if any(needle.lower() in node["text"].lower() and self.visible(node) for node in nodes):
                return True
            self.swipe_up()
        return False

    def candidates(self, nodes, needle, forbid=()):
        needle_l = needle.lower()
        found = []
        for node in nodes:
            text = node["text"].lower()
            if needle_l not in text:
                continue
            if any(word.lower() in text for word in forbid):
                continue
            found.append(node)
        found.sort(key=lambda node: (node["class"] == "ocr", node["cy"]))
        return found

    def tap_node(self, node):
        print(f"tap {node['cx']},{node['cy']} {node['text']!r}", flush=True)
        self.shell(f"input tap {node['cx']} {node['cy']}")
        time.sleep(0.8)

    def tap_text(self, needle, forbid=(), scrolls=4):
        for _ in range(scrolls + 1):
            nodes = self.look(needle, forbid)
            found = [node for node in self.candidates(nodes, needle, forbid) if self.visible(node)]
            if found:
                # Prefer a real control over an OCR hit, then the lowest match
                # so a footer Continue wins over a heading that merely mentions it.
                found.sort(key=lambda node: (node["class"].startswith("ocr"), -node["cy"]))
                self.tap_node(found[0])
                return True
            self.swipe_up()
        return False

    def tap_control(self, needle, scrolls=2):
        """Tap a button whose label is the needle, not a sentence that contains it."""
        for i in range(scrolls + 1):
            nodes = self.look(needle)
            found = [
                node for node in nodes
                if self.control_ready(node, needle) and is_control_label(node["text"], needle)
            ]
            if found:
                found.sort(key=lambda node: (
                    node["class"].startswith("ocr"),
                    not node["clickable"],
                    -node["cy"],
                ))
                self.tap_node(found[0])
                return True
            loose = [node["text"] for node in nodes if needle.lower() in node["text"].lower()]
            print("no control label", needle, "loose", loose[:8], flush=True)
            if i < scrolls:
                self.swipe_up()
        return False

    def hide_keyboard(self):
        result = self.shell("dumpsys input_method", check=False, timeout=25)
        text = result.stdout or ""
        if "mInputShown=true" not in text:
            return
        print("hiding keyboard", flush=True)
        self.shell("input keyevent KEYCODE_BACK", check=False)
        time.sleep(0.5)

    def wait_for(self, needle, timeout=45, forbid=()):
        deadline = time.time() + timeout
        last = ""
        while time.time() < deadline:
            nodes = self.look(needle, forbid)
            last = self.blob(nodes)
            if self.candidates(nodes, needle, forbid):
                return nodes
            if "isn't responding" in last or "not responding" in last.lower():
                self.tap_text("Wait", scrolls=0)
            time.sleep(1)
        self.save_text("wait-failed.txt", last)
        raise DriveError("timed out waiting for " + needle)

    def type_text(self, value):
        escaped = value.replace(" ", "%s").replace("&", "\\&")
        self.shell("input text " + escaped)
        time.sleep(0.4)

    def type_number(self, value):
        for char in value:
            if char.isdigit():
                self.shell("input keyevent " + str(7 + int(char)))
            elif char == ".":
                self.shell("input keyevent 56")
            else:
                raise DriveError("unsupported number " + value)
            time.sleep(0.05)
        time.sleep(0.3)

    def edit_texts(self, nodes):
        edits = [node for node in nodes if node["class"].endswith("EditText") and self.visible(node)]
        edits.sort(key=lambda node: (node["y1"], node["x1"]))
        return edits

    def fill_labeled(self, label, value, numeric=False):
        nodes = self.look(label)
        found = [node for node in self.candidates(nodes, label) if self.visible(node)]
        if not found:
            if not self.tap_text(label, scrolls=2):
                raise DriveError("could not find field " + label)
            nodes = self.look(label)
            found = [node for node in self.candidates(nodes, label) if self.visible(node)]
        if not found:
            raise DriveError("could not find field " + label)
        found.sort(key=lambda node: (node["class"].startswith("ocr"), node["cy"]))
        label_node = found[0]
        edits = [
            node for node in self.edit_texts(nodes)
            if node["cy"] >= label_node["y1"] - 10
        ]
        if edits:
            edits.sort(key=lambda node: abs(node["cy"] - label_node["y2"]))
            self.tap_node(edits[0])
        else:
            below = min(self.height - 8, label_node["y2"] + 70)
            print(f"tap below {label_node['cx']},{below} {label!r}", flush=True)
            self.shell(f"input tap {label_node['cx']} {below}")
            time.sleep(0.5)
        if numeric:
            self.type_number(value)
        else:
            self.type_text(value)

    def require(self, blob, needles, where):
        missing = []
        shown = []
        for needle in needles:
            options = needle if isinstance(needle, tuple) else (needle,)
            if any(option in blob for option in options):
                shown.append(options[0] if len(options) == 1 else " or ".join(options))
            else:
                missing.append(" or ".join(options))
        if missing:
            self.save_text(where.replace(" ", "-") + "-observed.txt", blob)
            raise DriveError(where + " missing " + ", ".join(missing))
        print(where, "has", ", ".join(shown), flush=True)

    def forbid(self, blob, needles, where):
        hit = [needle for needle in needles if needle in blob]
        if hit:
            self.save_text(where + "-observed.txt", blob)
            raise DriveError(where + " shows unexpected " + ", ".join(hit))

    def logcat(self):
        result = self.shell("logcat -d -t 300", check=False, timeout=30)
        self.save_text("logcat.txt", (result.stdout or "") + (result.stderr or ""))

    def install(self, apk, replace=False):
        flag = ["-r"] if replace else []
        result = self.adb("install", *flag, apk, check=False, timeout=180)
        text = (result.stdout or "") + (result.stderr or "")
        if result.returncode != 0 or "Success" not in text:
            raise DriveError("install failed: " + text[-500:])


def assert_apk(path):
    data = Path(path).read_bytes()[:4]
    if data != b"PK\x03\x04":
        raise DriveError(path + " is not an APK")


def upgrade(driver, old_apk, new_apk):
    assert_apk(old_apk)
    assert_apk(new_apk)
    driver.wake()
    driver.read_size()
    driver.install(old_apk, replace=False)
    code, name = driver.version_line()
    print("installed old", name, code, flush=True)
    if name != "0.2.33":
        raise DriveError("expected v0.2.33, installed " + name)
    driver.launch()
    driver.wait_for("Meet Folio", timeout=50)
    driver.shot("onboarding")
    if not driver.tap_text("Continue", forbid=("Android",)):
        raise DriveError("could not tap onboarding Continue")
    driver.wait_for("available balance", timeout=20)
    driver.fill_labeled("available balance", "8420.50", numeric=True)
    driver.fill_labeled("monthly income", "15000", numeric=True)
    driver.fill_labeled("spending target", "9000", numeric=True)
    driver.shot("onboarding-filled")
    if not driver.tap_text("Continue", forbid=("Android",)):
        raise DriveError("could not leave the balance step")
    driver.wait_for("Capture only", timeout=20)
    if not driver.tap_text("Continue", forbid=("Android",)):
        raise DriveError("could not skip notification access")
    driver.wait_for("Open Folio", timeout=20)
    if not driver.tap_text("Open Folio"):
        raise DriveError("could not open Folio")
    driver.wait_for("Your money", timeout=25)

    driver.scroll_to_top()
    time.sleep(0.4)
    if not driver.tap_control("Add transaction", scrolls=0):
        driver.scroll_to_top()
        if not driver.tap_control("Add transaction", scrolls=0):
            raise DriveError("could not open the transaction form")
    driver.wait_for("New transaction", timeout=15)
    driver.fill_labeled("Merchant or source", "Carrefour")
    driver.hide_keyboard()
    driver.fill_labeled("Amount", "125.50", numeric=True)
    driver.hide_keyboard()
    if not driver.tap_control("Add transaction", scrolls=0):
        driver.hide_keyboard()
        if not driver.tap_control("Add transaction", scrolls=1):
            raise DriveError("could not find the Add transaction button")
    driver.wait_for("Carrefour", timeout=20)
    driver.bring_into_view("Carrefour")
    driver.shot("transaction")

    if not (driver.tap_control("Budgets", scrolls=1) or driver.tap_control("Budget", scrolls=1)):
        raise DriveError("could not open Budgets")
    driver.wait_for("Set a budget", timeout=20)
    if not driver.tap_control("Set a budget", scrolls=2):
        raise DriveError("could not open the budget form")
    driver.wait_for("Monthly limit", timeout=15)
    driver.fill_labeled("Monthly limit", "3500", numeric=True)
    driver.hide_keyboard()
    if not driver.tap_control("Save budget", scrolls=2):
        raise DriveError("could not save the budget")
    driver.wait_for("Food", timeout=20)

    before_home = ""
    if driver.tap_control("Home", scrolls=1) or driver.tap_control("Overview", scrolls=1):
        time.sleep(1)
    before_home = driver.collect(scrolls=3)
    driver.save_text("before-home.txt", before_home)
    balance_ok = ("8,295", "8,420.50", "8,420.5")
    driver.require(before_home, ["Carrefour", ("125.50", "125.5"), balance_ok, "9,000"], "before-upgrade overview")
    if not (driver.tap_control("Budgets", scrolls=1) or driver.tap_control("Budget", scrolls=1)):
        raise DriveError("could not return to Budgets")
    time.sleep(1)
    before_budget = driver.collect(scrolls=2)
    driver.save_text("before-budget.txt", before_budget)
    driver.require(before_budget, ["Food", "3,500", "9,000"], "before-upgrade budgets")
    driver.forbid(before_budget, ["350,000"], "before-upgrade budgets")
    driver.shot("before-upgrade")

    driver.install(new_apk, replace=True)
    new_code, new_name = driver.version_line()
    print("installed new", new_name, new_code, flush=True)
    if not new_code.isdigit() or int(new_code) <= int(code):
        raise DriveError("upgrade did not raise versionCode (" + code + " -> " + new_code + ")")
    driver.launch()
    driver.wait_for("Your money", timeout=50)
    if not driver.running():
        raise DriveError("Folio process exited after the upgrade launch")
    after_home = driver.collect(scrolls=3)
    driver.save_text("after-home.txt", after_home)
    if "Meet Folio" in after_home and "Carrefour" not in after_home:
        raise DriveError("upgrade returned to onboarding and the entered records are not on screen")
    driver.require(after_home, ["Carrefour", ("125.50", "125.5"), balance_ok, "9,000"], "after-upgrade overview")
    if not (driver.tap_control("Budgets", scrolls=1) or driver.tap_control("Budget", scrolls=1)):
        raise DriveError("could not open Budgets after upgrade")
    time.sleep(1)
    after_budget = driver.collect(scrolls=2)
    driver.save_text("after-budget.txt", after_budget)
    driver.require(after_budget, ["Food", "3,500", "9,000"], "after-upgrade budgets")
    driver.forbid(after_budget, ["350,000"], "after-upgrade budgets")
    driver.shot("after-upgrade")
    print("UPGRADE_DATA_SURVIVED", new_name, new_code, flush=True)


def launch(driver, apk):
    assert_apk(apk)
    driver.wake()
    driver.read_size()
    driver.install(apk, replace=False)
    code, name = driver.version_line()
    print("installed", name, code, flush=True)
    if not code.isdigit() or int(code) < 140:
        raise DriveError("expected versionCode >= 140, got " + code)
    driver.launch()
    driver.wait_for("Meet Folio", timeout=50)
    time.sleep(2)
    if not driver.running():
        raise DriveError("Folio process exited after launch")
    driver.shot("launched")
    print("LAUNCH_OK", name, code, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("upgrade", "launch"))
    parser.add_argument("--apk")
    parser.add_argument("--old")
    parser.add_argument("--new")
    parser.add_argument("--artifacts", required=True)
    args = parser.parse_args()
    driver = Driver(Path(args.artifacts))
    try:
        if args.mode == "upgrade":
            if not args.old or not args.new:
                raise DriveError("upgrade needs --old and --new")
            upgrade(driver, args.old, args.new)
        else:
            if not args.apk:
                raise DriveError("launch needs --apk")
            launch(driver, args.apk)
    except Exception as exc:
        print("FAILED", exc, flush=True)
        try:
            driver.shot("failure")
            driver.logcat()
        except Exception as inner:
            print("could not save failure evidence", inner, flush=True)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
