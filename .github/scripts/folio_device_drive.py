#!/usr/bin/env python3
"""Drive the installed Folio APK through adb.

The release APK is not modified. Buttons and fields are found from the
accessibility tree, with a screenshot OCR fallback when WebView text is
missing from that tree.
"""
import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import statistics
import subprocess
import sys
import textwrap
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PKG = "com.folio.finance.app"
ACTIVITY = PKG + "/com.folio.finance.MainActivity"
WEBVIEW_LEVELDB = (
    "/data/data/" + PKG + "/app_webview/Default/Local Storage/leveldb",
    "/data/data/" + PKG + "/app_webview/Local Storage/leveldb",
    "/data/user/0/" + PKG + "/app_webview/Default/Local Storage/leveldb",
    "/data/user/0/" + PKG + "/app_webview/Local Storage/leveldb",
)


def sh_quote(text):
    return "'" + str(text).replace("'", "'\\''") + "'"


def count_storage_marker(blob, text):
    """Count a localStorage marker in raw LevelDB bytes.

    WebView stores the JSON as UTF-8. Some records are UTF-16LE. Snappy-compressed
    table blocks are not decoded; a just-flushed write is in the uncompressed log.
    """
    if not blob or not text:
        return 0
    raw = text.encode("utf-8")
    wide = text.encode("utf-16-le")
    return blob.count(raw) + blob.count(wide)


def upgrade_settled_home(blob):
    """The post-upgrade home signal.

    Onboarding's eyebrow is 'YOUR MONEY, SIMPLIFIED', so a case-insensitive
    search for 'Your money' matches setup and returns before the ledger paints.
    Home is 'Available estimate' or 'Edit Carrefour', and never 'Meet Folio'.
    """
    lowered = (blob or "").lower()
    if "meet folio" in lowered:
        return False
    return "available estimate" in lowered or "edit carrefour" in lowered


def normalized_label(text):
    cleaned = " ".join(str(text).split()).lower()
    cleaned = cleaned.replace("→", " ").replace("›", " ").replace("»", " ")
    return " ".join(cleaned.split()).strip(" .:-")


def is_control_label(text, needle):
    """True when the node is the control, not a sentence that mentions it."""
    return normalized_label(text) == normalized_label(needle)


DIALOG_TITLES = (
    "new transaction",
    "edit transaction",
    "set monthly budget",
    "edit budget",
)


def choose_blur_node(nodes, height, width):
    """Pick a non-input to tap so the keyboard closes.

    A dialog title wins over the folio wordmark. The wordmark stays in the
    tree above the sheet, and tapping it hits the overlay and closes the form.
    Returns None when a Close control is up but the title is not visible;
    the caller then taps inside the sheet instead of the wordmark.
    """
    titles = []
    marks = []
    dialog = False
    for node in nodes:
        text = node.get("text") or ""
        if node["x2"] - node["x1"] < 24 or node["y2"] - node["y1"] < 24:
            continue
        if not (0 <= node["cx"] <= width and 0 <= node["cy"] <= height):
            continue
        label = normalized_label(text)
        if is_control_label(text, "Close"):
            dialog = True
        if any(wanted in label for wanted in DIALOG_TITLES):
            titles.append(node)
            dialog = True
        elif is_blur_target(text) and not node["class"].endswith("EditText") and not node["class"].endswith("Button"):
            marks.append(node)
    if titles:
        titles.sort(key=lambda node: node["cy"])
        return titles[0]
    if dialog:
        return None
    if marks:
        marks.sort(key=lambda node: node["cy"])
        return marks[0]
    return None


def is_blur_target(text):
    """A non-input label that releases focus without closing a dialog.

    The left screen edge is the modal overlay. Tapping it dismisses
    New transaction. The wordmark and the dialog title sit inside the page.
    """
    raw = " ".join(str(text).split()).lower()
    if raw in {"◈ folio.", "folio.", "folio"} or raw.startswith("◈ folio"):
        return True
    label = normalized_label(text)
    for wanted in (
        "make it yours",
        "new transaction",
        "edit transaction",
        "set monthly budget",
        "edit budget",
        "your financial starting point",
    ):
        if wanted in label:
            return True
    return False


def field_holds(text, value):
    """True when an EditText shows value, or does not expose a number.

    WebView accessibility text is often "8420.50, Current available balance".
    A longer digit run means later keystrokes landed in the same field, which
    is what API 35 did when the keyboard covered the next rows.
    """
    cleaned = " ".join(str(text).split())
    match = re.search(r"\d[\d,]*\.?\d*", cleaned)
    if not match:
        return True
    shown = match.group(0).replace(",", "")
    try:
        return abs(float(shown) - float(value)) <= 1e-6
    except ValueError:
        return False


def tap_point(node, height, safe_margin=140, gesture_margin=72):
    """Screen point for a control, or None when the hit would fall in the gesture strip.

    A center in the bottom 140px is a miss on API 35: the v0.2.33 Continue
    button sat at y=1897 and the tap never left the balance step. If the
    control still reaches above the gesture strip, tap that higher point.
    """
    if node["x2"] - node["x1"] < 24 or node["y2"] - node["y1"] < 24:
        return None
    if node["cy"] < 0 or node["cy"] > height or node["cx"] < 0:
        return None
    if node["cy"] < height - safe_margin:
        return node["cx"], node["cy"]
    y = min(node["y2"] - 8, node["y1"] + 8)
    y = min(y, height - gesture_margin - 1)
    if node["y1"] + 4 <= y <= node["y2"] - 4:
        return node["cx"], y
    return None


# Old-app setup only. The post-upgrade survival checks are not retried here.
# A pull-request run has no candidate tag, so it upgrades into releases/latest
# and still has to print STORAGE_DURABLE_BEFORE and UPGRADE_DATA_SURVIVED.
SETUP_STEP_ATTEMPTS = 3
SETUP_NODE_WAIT_SECONDS = 25
SETUP_SCROLL_LIMIT = 3
SETUP_TAB_LIMIT = 4
SETUP_WAIT_LIMIT = 2


def node_packages(nodes):
    return {node.get("package") or "" for node in nodes if node.get("package")}


def blocker_kind(blob, packages):
    """Why the old app cannot be driven, or None when Folio is in front.

    An ANR dialog is checked before the package set. Pixel Launcher's
    "isn't responding" card replaces the tree, and the home screen does too.
    """
    lowered = (blob or "").lower()
    if "isn't responding" in lowered or "not responding" in lowered:
        return "anr"
    pkgs = {pkg for pkg in packages if pkg}
    if not pkgs or PKG in pkgs:
        return None
    if any("launcher" in pkg for pkg in pkgs):
        return "launcher"
    return "covered"


def label_focused(nodes, label):
    wanted = (label or "").lower()
    if not wanted:
        return False
    for node in nodes:
        if not node.get("focused"):
            continue
        if not str(node.get("class") or "").endswith("EditText"):
            continue
        if wanted in (node.get("text") or "").lower():
            return True
    return False


def next_setup_probe(found, keyboard, blocker, scrolls_done, tabs_done, waits_done,
                     clipped=False, anchor=False, scroll_limit=SETUP_SCROLL_LIMIT,
                     tab_limit=SETUP_TAB_LIMIT, wait_limit=SETUP_WAIT_LIMIT):
    """One bounded action while the old app's target is not ready.

    A launcher ANR or a covered Folio is recovered before any tap or scroll.
    The number pad hides the spending-target row, so a swipe while the
    keyboard is up is not a scroll. Re-dump a couple of times before tabbing
    or scrolling: the accessibility tree lags the pixels, and scrolling a
    visible field pushes it off the page.
    """
    if blocker:
        return "recover"
    # The pad hides the next row. A hit under it can type into the field
    # that is already focused, so the pad goes away before any tap or scroll.
    if keyboard:
        return "dismiss-keyboard"
    if found:
        return "tap"
    if clipped and scrolls_done < scroll_limit:
        return "scroll"
    if waits_done < wait_limit:
        return "wait"
    if anchor and tabs_done < tab_limit:
        return "tab"
    if scrolls_done < scroll_limit:
        return "scroll"
    return "wait"


# The row renders the Unicode minus used by the app: −EGP 125.50.
# Cash-flow text can also expose the same expense as EGP−125.5.
EXPENSE_125 = (
    "−EGP 125.50", "−EGP 125.5",
    "-EGP 125.50", "-EGP 125.5",
    "EGP−125.50", "EGP−125.5",
    "EGP-125.50", "EGP-125.5",
)
BALANCE_AFTER_ENTRY = ("8,295", "8,420.50", "8,420.5")


def assert_entered(driver, home, budget, where):
    """Every value typed on v0.2.33 must still be on screen."""
    driver.require(home, ["Carrefour", EXPENSE_125, BALANCE_AFTER_ENTRY, "9,000"], where + " overview")
    driver.require(budget, ["Food", ("3,500", "3,500.00"), "9,000"], where + " budgets")
    driver.forbid(budget, ["350,000"], where + " budgets")


class DriveError(Exception):
    pass


class Driver:
    def __init__(self, artifacts: Path):
        self.artifacts = artifacts
        self.artifacts.mkdir(parents=True, exist_ok=True)
        self.step = 0
        self.width, self.height = 1080, 1920

    def run(self, args, check=True, timeout=60, quiet=False):
        if not quiet:
            print("+", " ".join(args), flush=True)
        result = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
        if not quiet and result.stdout:
            print(result.stdout[-2000:], flush=True)
        if not quiet and result.stderr:
            print(result.stderr[-2000:], flush=True)
        if check and result.returncode != 0:
            raise DriveError("command failed: " + " ".join(args))
        return result

    def adb(self, *args, check=True, timeout=60, quiet=False):
        return self.run(["adb", *args], check=check, timeout=timeout, quiet=quiet)

    def shell(self, script, check=True, timeout=60, quiet=False):
        return self.adb("shell", script, check=check, timeout=timeout, quiet=quiet)

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

    def prop(self, name):
        result = self.shell("getprop " + name, check=False)
        return (result.stdout or "").strip()

    def note_sdk(self):
        sdk = self.prop("ro.build.version.sdk")
        release = self.prop("ro.build.version.release")
        self.save_text("device-sdk.txt", "sdk=" + sdk + "\nrelease=" + release + "\n")
        print("device sdk", sdk, "release", release, flush=True)
        return sdk, release

    def settle_stopped(self):
        """Force-stop Folio and wait until its process is gone.

        This is a process-cold start. It does not drop the kernel page cache
        and it does not stop the WebView provider process.
        """
        self.shell("am force-stop " + PKG, check=False)
        deadline = time.time() + 8
        while time.time() < deadline:
            if not self.running():
                time.sleep(1.0)
                return
            time.sleep(0.2)
        raise DriveError("process still running after force-stop")

    def am_start_w(self):
        result = self.adb("shell", "am", "start", "-W", "-n", ACTIVITY, check=False, timeout=90)
        text = ((result.stdout or "") + "\n" + (result.stderr or "")).strip()
        if result.returncode != 0:
            raise DriveError("am start -W failed: " + text[-400:])
        parsed = parse_am_start(text)
        parsed["raw"] = text
        return parsed

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
                                "package": node.attrib.get("package") or "",
                                "clickable": False,
                                "focused": node.attrib.get("focused") == "true",
                                "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                                "cx": 0, "cy": -1,
                            })
                        continue
                    nodes.append({
                        "text": text,
                        "class": node.attrib.get("class") or "",
                        "package": node.attrib.get("package") or "",
                        "clickable": node.attrib.get("clickable") == "true",
                        "focused": node.attrib.get("focused") == "true",
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
        usable = self.candidates(ui, needle, forbid) if needle else []
        in_zone = [node for node in usable if tap_point(node, self.height)]
        if needle and in_zone:
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

    def scroll_from_safe_area(self):
        """Scroll the WebView from the title band, not from a text field.

        A swipe that starts on an EditText is swallowed as a caret drag, so
        the footer Continue stays at the same y. The balance step's title
        sits near 38% of the screen, above the form.
        """
        x = self.width // 2
        y_start = int(self.height * 0.38)
        y_end = int(self.height * 0.16)
        print("scroll", x, y_start, y_end, flush=True)
        self.shell(f"input swipe {x} {y_start} {x} {y_end} 450")
        time.sleep(0.6)

    def tap_xy(self, x, y, label):
        print(f"tap {x},{y} {label!r}", flush=True)
        self.shell(f"input tap {x} {y}")
        time.sleep(0.8)

    def tap_text(self, needle, forbid=(), scrolls=4):
        for i in range(scrolls + 1):
            nodes = self.look(needle, forbid)
            matches = self.candidates(nodes, needle, forbid)
            ready = []
            for node in matches:
                point = tap_point(node, self.height)
                if point and self.visible(node):
                    ready.append((node, point))
            if ready:
                # Prefer a real button over an OCR hit or a sentence, then
                # the lowest match so a footer Continue wins over a heading.
                ready.sort(key=lambda item: (
                    item[0]["class"].startswith("ocr"),
                    not item[0]["class"].endswith("Button"),
                    not is_control_label(item[0]["text"], needle),
                    -item[1][1],
                ))
                node, (x, y) = ready[0]
                self.tap_xy(x, y, node["text"])
                return True
            clipped = [node for node in matches if self.visible(node)]
            if clipped and i < scrolls:
                print("clipped", needle, clipped[0]["cy"], "scrolling", flush=True)
                self.scroll_from_safe_area()
                continue
            if i < scrolls:
                self.scroll_from_safe_area()
        return False

    def activate_focused_control(self, needle, tabs=6):
        """Tab to a button and press Enter.

        API 35 draws the onboarding footer inside the gesture strip, so a
        coordinate tap can miss even after the page is scrolled.
        """
        target = normalized_label(needle)
        for _ in range(tabs + 1):
            nodes = self.dump_nodes()
            for node in nodes:
                if not node.get("focused"):
                    continue
                label = normalized_label(node["text"])
                if is_control_label(node["text"], needle) or (
                    node["class"].endswith("Button") and target in label
                ):
                    print("activate", node["text"], flush=True)
                    self.shell("input keyevent 66")
                    time.sleep(0.8)
                    return True
            self.shell("input keyevent 61")
            time.sleep(0.35)
        return False

    def leave_step(self, button, after, forbid=(), attempts=SETUP_STEP_ATTEMPTS):
        """Leave an onboarding step once `after` is on screen.

        Retries a coordinate tap, then Tab/Enter, and waits for the WebView
        to show the next step. A tap that does not change the page is a miss.
        The keyboard stays down so the footer is not covered, and an ANR or
        the launcher is cleared before the tap. This does not run after the
        candidate is installed.
        """
        print("step", button, flush=True)
        for attempt in range(attempts):
            if attempt:
                print("retry step", button, str(attempt + 1) + "/" + str(attempts), flush=True)
            if self.tree_has(after):
                print("step", button, "ok", flush=True)
                return True
            self.dismiss_keyboard_for_setup()
            tapped = self.drive_setup_target(button, forbid=forbid, kind="button")
            if not tapped:
                print("tap missed", button, "trying focus", attempt, flush=True)
                self.activate_focused_control(button)
            try:
                self.wait_for(after, timeout=12)
                print("step", button, "ok", flush=True)
                return True
            except DriveError:
                print("did not reach", after, "attempt", attempt, flush=True)
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

    def keyboard_shown(self):
        result = self.shell("dumpsys input_method", check=False, timeout=25, quiet=True)
        return "mInputShown=true" in (result.stdout or "")

    def default_ime(self):
        ime = self.shell("settings get secure default_input_method", check=False, quiet=True)
        ident = (ime.stdout or "").strip()
        if not ident or ident == "null" or any(ch.isspace() for ch in ident):
            return ""
        return ident

    def dismiss_keyboard_for_setup(self):
        """Hide the number pad and leave the IME disabled.

        Re-enabling it while the previous balance field is still focused
        opens the pad over the spending target. Digits are entered with
        keyevents, which do not need the pad. Back is not used.
        """
        if not self.keyboard_shown():
            return False
        print("dismissing keyboard", flush=True)
        self.blur_inputs()
        deadline = time.time() + 2.5
        while time.time() < deadline and self.keyboard_shown():
            time.sleep(0.3)
        if not self.keyboard_shown():
            print("keyboard dismissed", flush=True)
            time.sleep(0.35)
            return True
        ident = self.default_ime()
        if not ident:
            print("keyboard still up", flush=True)
            return False
        self.shell("ime disable " + ident, check=False)
        time.sleep(0.4)
        if self.keyboard_shown():
            print("keyboard still up", ident, flush=True)
            return False
        print("keyboard dismissed", ident, flush=True)
        return True

    def ensure_ime_enabled(self):
        ident = self.default_ime()
        if not ident:
            print("no default ime", flush=True)
            return
        self.shell("ime enable " + ident, check=False)
        print("ime enabled", ident, flush=True)

    def recover_setup_screen(self, nodes):
        """Dismiss an ANR or bring Folio forward. Does not force-stop Folio."""
        kind = blocker_kind(self.blob(nodes), node_packages(nodes))
        if not kind:
            return False
        if kind == "anr":
            self.dismiss_anr(self.blob(nodes))
            return True
        print("folio not in front", kind, flush=True)
        self.adb("shell", "am", "start", "-n", ACTIVITY)
        time.sleep(1.0)
        return True

    def tree_has(self, needle):
        nodes = self.dump_nodes()
        print("redump", needle, "nodes", len(nodes), flush=True)
        if self.recover_setup_screen(nodes):
            return False
        return needle.lower() in self.blob(nodes).lower()

    def tappable_matches(self, nodes, needle, forbid=()):
        ready = []
        for node in self.candidates(nodes, needle, forbid):
            point = tap_point(node, self.height)
            if point and self.visible(node):
                ready.append((node, point))
        ready.sort(key=lambda item: (
            item[0]["class"].startswith("ocr"),
            not item[0]["class"].endswith("Button"),
            not is_control_label(item[0]["text"], needle),
            -item[1][1],
        ))
        return ready

    def clipped_matches(self, nodes, needle, forbid=()):
        clipped = []
        for node in self.candidates(nodes, needle, forbid):
            if self.visible(node) and tap_point(node, self.height) is None:
                clipped.append(node)
        return clipped

    def tap_labeled_edit(self, nodes, label):
        found = [node for node in self.candidates(nodes, label) if self.visible(node)]
        if not found:
            return False
        found.sort(key=lambda node: (node["class"].startswith("ocr"), node["cy"]))
        label_node = found[0]
        if label_node["class"].endswith("EditText"):
            self.tap_node(label_node)
            return True
        edits = [
            node for node in self.edit_texts(nodes)
            if node["cy"] >= label_node["y1"] - 10
        ]
        if edits:
            edits.sort(key=lambda node: abs(node["cy"] - label_node["y2"]))
            self.tap_node(edits[0])
            return True
        below = min(self.height - 8, label_node["y2"] + 70)
        print(f"tap below {label_node['cx']},{below} {label!r}", flush=True)
        self.shell(f"input tap {label_node['cx']} {below}")
        time.sleep(0.5)
        return True

    def tab_from_anchor(self, nodes, anchor, needle):
        print("tab to", needle, "from", anchor, flush=True)
        if not label_focused(nodes, anchor):
            if not self.tap_labeled_edit(nodes, anchor):
                print("tab anchor missing", anchor, flush=True)
                return False
            time.sleep(0.3)
        self.shell("input keyevent 61")
        time.sleep(0.4)
        return True

    def drive_setup_target(self, needle, forbid=(), anchor=None, kind="field",
                           require_focus=True, timeout=None, while_text=None):
        """Wait for an old-app control, re-dumping until the timeout.

        kind=button taps once the node is tappable. kind=field taps the
        editor under the label and, when require_focus is set, returns only
        after that editor is focused. Returns False when the budget runs out.
        """
        timeout = SETUP_NODE_WAIT_SECONDS if timeout is None else timeout
        scrolls = 0
        tabs = 0
        waits = 0
        deadline = time.time() + timeout
        last = []
        print("waiting for", needle, flush=True)
        while time.time() < deadline:
            nodes = self.dump_nodes()
            last = nodes
            print("redump", needle, "nodes", len(nodes), flush=True)
            if kind == "field" and require_focus and label_focused(nodes, needle):
                print("step", needle, "focused", flush=True)
                return True
            blocker = blocker_kind(self.blob(nodes), node_packages(nodes))
            ready = [] if blocker else self.tappable_matches(nodes, needle, forbid)
            clipped = [] if blocker else self.clipped_matches(nodes, needle, forbid)
            keyboard = False if blocker else self.keyboard_shown()
            action = next_setup_probe(
                found=bool(ready),
                keyboard=keyboard,
                blocker=blocker,
                scrolls_done=scrolls,
                tabs_done=tabs,
                waits_done=waits,
                clipped=bool(clipped),
                anchor=bool(anchor) and kind == "field",
            )
            print("setup", needle, action, flush=True)
            if action == "recover":
                self.recover_setup_screen(nodes)
                time.sleep(0.6)
                continue
            if action == "dismiss-keyboard":
                self.dismiss_keyboard_for_setup()
                continue
            if action == "tap":
                if while_text and while_text.lower() not in self.blob(nodes).lower():
                    # The button on this dump belongs to a different step.
                    print("waiting for", while_text, flush=True)
                    return False
                if kind == "button":
                    node, (x, y) = ready[0]
                    self.tap_xy(x, y, node["text"])
                    return True
                self.tap_labeled_edit(nodes, needle)
                if not require_focus:
                    return True
                check = self.dump_nodes()
                print("redump", needle, "nodes", len(check), flush=True)
                if label_focused(check, needle):
                    print("step", needle, "focused", flush=True)
                    return True
                continue
            if action == "tab":
                tabs += 1
                print("retry step", needle, "tab", str(tabs) + "/" + str(SETUP_TAB_LIMIT), flush=True)
                self.tab_from_anchor(nodes, anchor, needle)
                continue
            if action == "scroll":
                scrolls += 1
                print("scroll to", needle, str(scrolls) + "/" + str(SETUP_SCROLL_LIMIT), flush=True)
                self.scroll_from_safe_area()
                continue
            waits += 1
            time.sleep(0.6)
        sample = [node["text"] for node in last if node.get("text")][:8]
        print("step", needle, "saw", sample, flush=True)
        return False

    def tap_setup_button(self, needle, confirm, forbid=(), while_text=None, attempts=None):
        """Tap an old-app button and stop once `confirm` is on screen.

        A later page that also says Continue is not tapped again: if `confirm`
        is already up, the step is done. `while_text` must still be in the
        same dump as the button, so a slow transition is not a second tap.
        """
        attempts = SETUP_STEP_ATTEMPTS if attempts is None else attempts
        print("step", needle, flush=True)
        for attempt in range(1, attempts + 1):
            if attempt > 1:
                print("retry step", needle, str(attempt) + "/" + str(attempts), flush=True)
            if self.tree_has(confirm):
                print("step", needle, "ok", flush=True)
                return True
            tapped = self.drive_setup_target(
                needle, forbid=forbid, kind="button", while_text=while_text,
            )
            if not tapped:
                print("step", needle, "not ready", flush=True)
                continue
            try:
                self.wait_for(confirm, timeout=12)
            except DriveError:
                print("step", needle, "did not reach", confirm, flush=True)
                continue
            print("step", needle, "ok", flush=True)
            return True
        return False

    def blur_inputs(self):
        """Release the focused editor without tapping a dialog overlay.

        Re-enabling the IME while the balance field stays focused opens the
        number pad again. A gutter tap does that, and it also hits the
        transaction sheet's backdrop, which closes the form.
        """
        nodes = self.dump_nodes()
        chosen = choose_blur_node(nodes, self.height, self.width)
        if chosen is not None:
            self.tap_node(chosen)
            return
        if any(is_control_label(node["text"], "Close") and self.visible(node) for node in nodes):
            x = self.width // 2
            y = max(140, int(self.height * 0.2))
            print(f"blur inside dialog {x},{y}", flush=True)
            self.shell(f"input tap {x} {y}")
            time.sleep(0.4)
            return
        x = self.width // 2
        y = max(90, int(self.height * 0.08))
        print(f"blur tap {x},{y}", flush=True)
        self.shell(f"input tap {x} {y}")
        time.sleep(0.4)

    def hide_keyboard(self):
        # MainActivity treats Back as "go to the overview", so Back must not
        # be used to dismiss the keyboard.
        if not self.keyboard_shown():
            return
        self.blur_inputs()
        deadline = time.time() + 3
        while time.time() < deadline and self.keyboard_shown():
            time.sleep(0.3)
        if not self.keyboard_shown():
            # 100dvh on API 35 keeps the footer in the gesture strip until the
            # viewport settles after the keyboard closes.
            time.sleep(0.4)
            return
        ime = self.shell("settings get secure default_input_method", check=False)
        ident = (ime.stdout or "").strip()
        if not ident or ident == "null" or any(ch.isspace() for ch in ident):
            print("keyboard visible, leaving it up", ident, flush=True)
            return
        print("hiding keyboard", ident, flush=True)
        self.shell("ime disable " + ident, check=False)
        time.sleep(0.4)
        self.blur_inputs()
        self.shell("ime enable " + ident, check=False)
        time.sleep(0.5)

    def dismiss_anr(self, blob):
        """Clear a system ANR that covers Folio.

        API 35 once showed Pixel Launcher isn't responding over the first
        paint, so Meet Folio never entered the accessibility tree. Wait is
        tapped first. A launcher ANR is also force-stopped, then Folio is
        brought forward without killing its process.
        """
        print("dismiss anr", flush=True)
        self.tap_text("Wait", scrolls=0)
        if "launcher" not in blob.lower():
            return
        for pkg in ("com.google.android.apps.nexuslauncher", "com.android.launcher3"):
            self.shell("am force-stop " + pkg, check=False)
        time.sleep(0.4)
        self.adb("shell", "am", "start", "-n", ACTIVITY)
        time.sleep(1)

    def wait_for(self, needle, timeout=45, forbid=()):
        deadline = time.time() + timeout
        last = ""
        while time.time() < deadline:
            nodes = self.look(needle, forbid)
            last = self.blob(nodes)
            if self.candidates(nodes, needle, forbid):
                return nodes
            if "isn't responding" in last or "not responding" in last.lower():
                self.dismiss_anr(last)
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

    def focused_edit(self):
        nodes = self.dump_nodes()
        focused = [
            node for node in nodes
            if node.get("focused") and node["class"].endswith("EditText")
        ]
        return focused[0] if focused else None

    def focus_matches(self, label):
        focused = self.focused_edit()
        if not focused:
            print("no focused edit", label, flush=True)
            return False
        print("focused", focused["text"], flush=True)
        return label.lower() in focused["text"].lower()

    def tap_field(self, label):
        # Text fields only need the tap. Numeric entry uses focus_field so a
        # digit is never typed into the previous row. Setup search leaves the
        # IME disabled; input text needs it enabled on this field.
        if not self.drive_setup_target(label, kind="field", require_focus=False):
            raise DriveError("could not find field " + label)
        self.ensure_ime_enabled()

    def focus_field(self, label, anchor=None):
        # Drop the keyboard before the tap. On API 35 the number pad covers
        # the lower fields, and a tap there inserts a digit into the field
        # that is already focused. Do not type until that field is this one.
        if not self.drive_setup_target(label, anchor=anchor, kind="field", require_focus=True):
            raise DriveError("could not find field " + label)

    def focused_field_ok(self, value):
        focused = self.focused_edit()
        if not focused:
            print("field value not exposed", value, flush=True)
            return True
        text = focused["text"]
        print("focused field", text, flush=True)
        return field_holds(text, value)

    def clear_focused_number(self):
        self.shell("input keyevent 123")
        self.shell("input keyevent " + " ".join(["67"] * 28))
        time.sleep(0.2)

    def fill_labeled(self, label, value, numeric=False, anchor=None):
        if not numeric:
            # The transaction sheet auto-focuses its first field. Blurring the
            # wordmark above that sheet clicks the overlay and closes it.
            # input text needs an IME; numeric setup leaves it disabled.
            self.ensure_ime_enabled()
            nodes = self.dump_nodes()
            if not self.candidates(nodes, label):
                self.hide_keyboard()
            self.tap_field(label)
            self.type_text(value)
            return
        last_error = None
        for attempt in range(SETUP_STEP_ATTEMPTS):
            if attempt:
                print(
                    "retry step", label,
                    str(attempt + 1) + "/" + str(SETUP_STEP_ATTEMPTS),
                    flush=True,
                )
            try:
                self.focus_field(label, anchor=anchor)
            except DriveError as exc:
                last_error = exc
                continue
            self.type_number(value)
            if self.focus_matches(label) and self.focused_field_ok(value):
                print("step", label, "ok", flush=True)
                return
            print("retry field", label, attempt, flush=True)
            # A miss can leave the previous field focused. Deleting there
            # would wipe the balance that was just entered.
            if self.focus_matches(label):
                self.clear_focused_number()
            else:
                print("refusing to clear a different field", flush=True)
        if last_error:
            raise last_error
        raise DriveError("could not enter " + label)

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

    def ensure_root(self):
        """google_apis images allow adb root. The release APK is not debuggable, so run-as cannot read WebView storage."""
        result = self.adb("root", check=False, timeout=40)
        self.adb("wait-for-device", check=False, timeout=40)
        root_log = ((result.stdout or "") + (result.stderr or "")).strip()
        deadline = time.time() + 15
        last = ""
        while time.time() < deadline:
            ident = self.shell("id", check=False)
            last = ((ident.stdout or "") + (ident.stderr or "")).strip()
            if "uid=0" in last:
                return True, root_log + "\n" + last
            time.sleep(0.5)
        return False, root_log + "\n" + last

    def capture_webview_storage(self, label):
        """Pull WebView LevelDB and record whether the entered merchant is on disk."""
        rooted, root_log = self.ensure_root()
        lines = ["label=" + label, "rooted=" + ("1" if rooted else "0"), root_log]
        dest = self.artifacts / ("webview-leveldb-" + label)
        if dest.exists():
            shutil.rmtree(dest)
        dest.mkdir(parents=True)
        found_dirs = 0
        for remote in WEBVIEW_LEVELDB:
            probe = self.shell("ls -la " + sh_quote(remote), check=False, timeout=20)
            listing = ((probe.stdout or "") + (probe.stderr or "")).strip()
            lines.append("DIR " + remote)
            lines.append(listing)
            if probe.returncode != 0 or "No such file" in listing or "Permission denied" in listing:
                continue
            found_dirs += 1
            local = dest / str(found_dirs)
            pulled = self.adb("pull", remote, str(local), check=False, timeout=90)
            lines.append(((pulled.stdout or "") + (pulled.stderr or "")).strip())
        carrefour = 0
        flag = 0
        scanned = 0
        for path in dest.rglob("*"):
            if not path.is_file():
                continue
            blob = path.read_bytes()
            scanned += len(blob)
            carrefour += count_storage_marker(blob, "Carrefour")
            flag += count_storage_marker(blob, "v2Onboarded")
        lines.append("bytes_scanned=" + str(scanned))
        lines.append("carrefour_hits=" + str(carrefour))
        lines.append("v2onboarded_hits=" + str(flag))
        lines.append("leveldb_dirs=" + str(found_dirs))
        self.save_text("storage-" + label + ".txt", "\n".join(lines) + "\n")
        return {
            "rooted": rooted,
            "dirs": found_dirs,
            "carrefour": carrefour > 0,
            "v2_onboarded": flag > 0,
            "carrefour_hits": carrefour,
            "bytes_scanned": scanned,
            "readable": rooted and found_dirs > 0,
        }

    def flush_webview_storage(self):
        """Background Folio so the WebView pauses and commits localStorage before install -r kills it."""
        print("send HOME so WebView onPause can flush localStorage", flush=True)
        self.shell("input keyevent 3", check=False)
        time.sleep(1.5)

    def require_records_on_disk(self):
        self.flush_webview_storage()
        last = {"rooted": False, "dirs": 0, "carrefour": False, "readable": False}
        for attempt in range(8):
            last = self.capture_webview_storage("before-upgrade")
            print(
                "storage before upgrade",
                "attempt", attempt,
                "carrefour", last["carrefour"],
                "dirs", last["dirs"],
                "rooted", last["rooted"],
                "bytes", last["bytes_scanned"],
                flush=True,
            )
            if last["carrefour"]:
                print("STORAGE_DURABLE_BEFORE", flush=True)
                return last
            time.sleep(1)
        if not last["rooted"]:
            raise DriveError("adb root did not grant uid 0, so WebView storage could not be read before upgrade")
        if not last["dirs"]:
            raise DriveError("WebView LevelDB directory was not found before upgrade")
        raise DriveError("storage was not durable before upgrade")

    def wait_for_upgrade_home(self, timeout=50):
        """Wait until the upgraded home is up. Onboarding is not success."""
        deadline = time.time() + timeout
        last = ""
        onboarding_since = None
        while time.time() < deadline:
            nodes = self.dump_nodes()
            last = self.blob(nodes)
            settled = upgrade_settled_home(last)
            print("upgrade home probe", "nodes", len(nodes), "settled", settled, flush=True)
            if settled:
                return last
            lowered = last.lower()
            if "meet folio" in lowered and "carrefour" not in lowered:
                if onboarding_since is None:
                    onboarding_since = time.time()
                elif time.time() - onboarding_since >= 15:
                    print("onboarding stayed up for 15s", flush=True)
                    break
            else:
                onboarding_since = None
            if "isn't responding" in last or "not responding" in lowered:
                self.dismiss_anr(last)
            time.sleep(1)
        self.save_text("wait-failed.txt", last)
        return last

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


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_am_start(text):
    """Parse `am start -W` output. TotalTime is the device-reported figure."""
    if "Warning: Activity not started" in text:
        raise DriveError("activity was already running: " + text[-400:])
    fields = {}
    for line in text.replace("\r", "").splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip()] = value.strip()
    status = fields.get("Status", "")
    if status.lower() != "ok":
        raise DriveError("am start -W status " + (status or "missing") + ": " + text[-400:])
    def millis(name, required=True):
        raw = fields.get(name, "")
        if not raw.isdigit():
            if required:
                raise DriveError("am start -W missing " + name + ": " + text[-500:])
            return None
        return int(raw)
    launch_state = fields.get("LaunchState")
    # API 34+ omits ThisTime. TotalTime is the figure the baseline uses.
    return {
        "status": status,
        "this_time_ms": millis("ThisTime", required=False),
        "total_time_ms": millis("TotalTime"),
        "wait_time_ms": millis("WaitTime"),
        "launch_state": launch_state,
        "activity": fields.get("Activity"),
    }


def summarize_ms(values):
    """Median and spread for a list of millisecond samples, in run order.

    spread is max - min. median matches statistics.median: the middle sample
    when n is odd, otherwise the mean of the two middle samples.
    """
    if not values:
        raise DriveError("no latency samples")
    ordered = sorted(values)
    stdev = statistics.stdev(values) if len(values) > 1 else 0.0
    return {
        "n": len(values),
        "min": ordered[0],
        "max": ordered[-1],
        "median": statistics.median(values),
        "spread_max_minus_min": ordered[-1] - ordered[0],
        "stdev": round(stdev, 2),
        "values": list(values),
    }


def uptime_delta_ms(start, end):
    return int(round((float(end) - float(start)) * 1000))


def parse_content_output(text):
    mode = "head"
    buckets = {"head": [], "startw": [], "poll": [], "log": []}
    markers = {
        "---STARTW---": "startw",
        "---POLL---": "poll",
        "---LOGCAT---": "log",
    }
    for line in text.replace("\r", "").splitlines():
        stripped = line.strip()
        if stripped in markers:
            mode = markers[stripped]
            continue
        buckets[mode].append(line)

    def kvs(lines):
        data = {}
        misses = []
        for line in lines:
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip()
            if key == "UP_MISS":
                misses.append(value)
            else:
                data[key] = value
        data["UP_MISS"] = misses
        return data

    return kvs(buckets["head"]), "\n".join(buckets["startw"]), kvs(buckets["poll"]), "\n".join(buckets["log"])


def logcat_deltas_ms(log_text):
    """Device log timestamps relative to the FolioBench START line, if present."""
    bench = None
    displayed = None
    page_finished = None
    for line in log_text.splitlines():
        match = re.match(r"\s*(\d+\.\d+)\b", line)
        if not match:
            continue
        stamp = float(match.group(1))
        if bench is None and "FolioBench" in line and "START" in line:
            bench = stamp
            continue
        if bench is None:
            continue
        if displayed is None and "Displayed com.folio.finance.app" in line:
            displayed = stamp
        if page_finished is None and "onPageFinished" in line:
            page_finished = stamp
    if bench is None:
        return {"displayed_ms": None, "on_page_finished_ms": None}
    def delta(stamp):
        if stamp is None:
            return None
        return int(round((stamp - bench) * 1000))
    return {
        "displayed_ms": delta(displayed),
        "on_page_finished_ms": delta(page_finished),
    }


def webview_shell():
    script = textwrap.dedent("""\
        ACT=__ACTIVITY__
        read_up() {
          read up _ < /proc/uptime
          printf '%s\\n' "$up"
        }
        logcat -c >/dev/null 2>&1 || true
        am force-stop __PKG__ || true
        i=0
        while pidof __PKG__ >/dev/null 2>&1; do
          i=$((i + 1))
          if [ "$i" -gt 8 ]; then
            echo WARN=process-still-running
            break
          fi
          sleep 1
        done
        sleep 1
        rm -f /data/local/tmp/folio-ui.xml /data/local/tmp/folio-startw.txt
        log -t FolioBench START || true
        UP_START=$(read_up)
        echo "UP_START=$UP_START"
        am start -W -n "$ACT" > /data/local/tmp/folio-startw.txt 2>&1
        echo "STARTW_RC=$?"
        echo "---STARTW---"
        cat /data/local/tmp/folio-startw.txt
        echo "---POLL---"
        prev=""
        found=0
        n=0
        while [ "$n" -lt 15 ]; do
          n=$((n + 1))
          if uiautomator dump /data/local/tmp/folio-ui.xml >/dev/null 2>&1; then
            up_after=$(read_up)
            if grep -q "Meet Folio" /data/local/tmp/folio-ui.xml; then
              echo "CONTENT_FOUND=1"
              echo "UP_SEEN=$up_after"
              echo "UP_PREV=$prev"
              echo "DUMPS=$n"
              found=1
              break
            fi
            prev=$up_after
            echo "UP_MISS=$up_after"
          else
            echo "DUMP_FAIL=$n"
            sleep 1
          fi
        done
        if [ "$found" -ne 1 ]; then
          echo "CONTENT_FOUND=0"
          echo "DUMPS=$n"
          echo "UP_PREV=$prev"
        fi
        echo "---LOGCAT---"
        logcat -d -v epoch -t 500 2>/dev/null | grep -E 'FolioBench|Displayed com.folio.finance.app|onPageFinished|WebViewFactory|cr_AwContents|cr_WebViewCallback|cr_WebViewChromium' || true
        """)
    return script.replace("__ACTIVITY__", ACTIVITY).replace("__PKG__", PKG)


def host_facts():
    cpu = ""
    mem = ""
    try:
        for line in Path("/proc/cpuinfo").read_text(errors="replace").splitlines():
            if line.startswith("model name"):
                cpu = line.split(":", 1)[1].strip()
                break
    except OSError:
        pass
    try:
        for line in Path("/proc/meminfo").read_text(errors="replace").splitlines():
            if line.startswith("MemTotal:"):
                mem = line.split(":", 1)[1].strip()
                break
    except OSError:
        pass
    return {
        "platform": platform.platform(),
        "python": platform.python_version(),
        "cpu_model": cpu,
        "cpu_count": os.cpu_count(),
        "mem_total": mem,
        "github_sha": os.environ.get("GITHUB_SHA"),
        "github_run_id": os.environ.get("GITHUB_RUN_ID"),
        "github_run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
        "runner_os": os.environ.get("RUNNER_OS"),
        "runner_arch": os.environ.get("RUNNER_ARCH"),
        "runner_name": os.environ.get("RUNNER_NAME"),
        "image_os": os.environ.get("ImageOS"),
        "image_version": os.environ.get("ImageVersion"),
    }


def self_check():
    sample = """Starting: Intent { cmp=com.folio.finance.app/.MainActivity }
Status: ok
LaunchState: COLD
Activity: com.folio.finance.app/.MainActivity
ThisTime: 410
TotalTime: 512
WaitTime: 520
Complete
"""
    parsed = parse_am_start(sample.replace("\n", "\r\n"))
    if parsed["total_time_ms"] != 512 or parsed["launch_state"] != "COLD":
        raise DriveError("parse_am_start missed TotalTime")
    modern = "Status: ok\nLaunchState: COLD\nActivity: x\nTotalTime: 2832\nWaitTime: 2931\nComplete\n"
    modern_parsed = parse_am_start(modern)
    if modern_parsed["total_time_ms"] != 2832 or modern_parsed["this_time_ms"] is not None:
        raise DriveError("API 34 output without ThisTime was rejected")
    legacy = "Status: ok\nThisTime: 10\nTotalTime: 11\nWaitTime: 12\nComplete\n"
    if parse_am_start(legacy)["launch_state"] is not None:
        raise DriveError("missing LaunchState should be empty")
    try:
        parse_am_start("Status: error\nError: failed\n")
    except DriveError:
        pass
    else:
        raise DriveError("error status was accepted")
    try:
        parse_am_start("Warning: Activity not started, its current task has been brought to the front")
    except DriveError:
        pass
    else:
        raise DriveError("warm warning was accepted")
    stats = summarize_ms([30, 10, 20, 40])
    if stats["median"] != 25 or stats["spread_max_minus_min"] != 30 or stats["min"] != 10:
        raise DriveError("summarize_ms mismatch " + str(stats))
    odd = summarize_ms([30, 10, 20])
    if odd["median"] != 20 or odd["values"] != [30, 10, 20]:
        raise DriveError("odd median should keep run order")
    if uptime_delta_ms("10.000", "10.512") != 512:
        raise DriveError("uptime delta")
    head, startw, poll, logs = parse_content_output(
        "UP_START=10.0\nSTARTW_RC=0\n---STARTW---\nStatus: ok\nTotalTime: 400\n"
        "---POLL---\nUP_MISS=10.5\nCONTENT_FOUND=1\nUP_SEEN=11.2\nUP_PREV=10.5\nDUMPS=2\n"
        "---LOGCAT---\n1710000000.100  1  1 I FolioBench: START\n"
        "1710000000.900  1  1 I ActivityTaskManager: Displayed com.folio.finance.app/.MainActivity: +800ms\n"
        "1710000001.250  1  1 I chromium: onPageFinished file:///android_asset/index.html\n"
    )
    if head["UP_START"] != "10.0" or "TotalTime: 400" not in startw or poll["CONTENT_FOUND"] != "1":
        raise DriveError("content output parse failed")
    if poll["UP_MISS"] != ["10.5"]:
        raise DriveError("miss list parse failed")
    deltas = logcat_deltas_ms(logs)
    if deltas["displayed_ms"] != 800 or deltas["on_page_finished_ms"] != 1150:
        raise DriveError("logcat delta parse failed " + str(deltas))
    shell = webview_shell()
    if "am start -W -n" not in shell or "Meet Folio" not in shell:
        raise DriveError("webview shell incomplete")
    if not is_blur_target("◈ folio."):
        raise DriveError("wordmark should blur focus")
    if not is_blur_target("New transaction"):
        raise DriveError("dialog title should blur focus")
    if is_blur_target("Meet Folio."):
        raise DriveError("onboarding title should not be a blur target")
    if is_blur_target("Open Folio"):
        raise DriveError("Open Folio should not be a blur target")
    if is_blur_target("Add transaction"):
        raise DriveError("Add transaction should not be a blur target")
    wordmark = {
        "text": "folio", "class": "android.widget.TextView",
        "x1": 42, "y1": 44, "x2": 312, "y2": 147, "cx": 177, "cy": 95,
    }
    title = {
        "text": "New transaction", "class": "android.widget.TextView",
        "x1": 80, "y1": 360, "x2": 700, "y2": 430, "cx": 390, "cy": 395,
    }
    chosen = choose_blur_node([wordmark, title], 1920, 1080)
    if chosen is None or chosen["text"] != "New transaction":
        raise DriveError("dialog title should win over the wordmark")
    if choose_blur_node([wordmark], 1920, 1080)["text"] != "folio":
        raise DriveError("wordmark should blur the onboarding page")
    if not field_holds("8420.50, Current available balance (EGP)", "8420.50"):
        raise DriveError("field_holds rejected a clean balance")
    if not field_holds("8420.5, Current available balance (EGP)", "8420.50"):
        raise DriveError("field_holds rejected a trimmed decimal")
    if not field_holds("Expected monthly income (EGP)", "15000"):
        raise DriveError("field_holds rejected a label-only node")
    if field_holds("8420.5061500099000, Current available balance (EGP)", "8420.50"):
        raise DriveError("field_holds accepted piled digits")
    clipped = {
        "text": "Continue →", "class": "android.widget.Button",
        "x1": 690, "y1": 1874, "x2": 1039, "y2": 1920, "cx": 864, "cy": 1897,
    }
    if tap_point(clipped, 1920) is not None:
        raise DriveError("clipped footer should not be tapped in the gesture strip")
    raised = {
        "text": "Continue →", "class": "android.widget.Button",
        "x1": 690, "y1": 1824, "x2": 1039, "y2": 1870, "cx": 864, "cy": 1847,
    }
    raised_point = tap_point(raised, 1920)
    if raised_point is None or raised_point[1] >= 1920 - 72:
        raise DriveError("raised footer should tap above the gesture strip " + str(raised_point))
    high = {
        "text": "Continue →", "class": "android.widget.Button",
        "x1": 690, "y1": 1680, "x2": 1039, "y2": 1800, "cx": 864, "cy": 1740,
    }
    if tap_point(high, 1920) != (864, 1740):
        raise DriveError("safe center should be used")
    if "$((i + 1))" not in shell or "__PKG__" in shell or "__ACTIVITY__" in shell or PKG not in shell:
        raise DriveError("webview shell substitution failed: " + shell[:400])
    if not (1 <= SETUP_STEP_ATTEMPTS <= 4):
        raise DriveError("setup retries are not bounded")
    if not (8 <= SETUP_NODE_WAIT_SECONDS <= 30):
        raise DriveError("setup wait is not bounded")
    if SETUP_SCROLL_LIMIT != 3 or SETUP_TAB_LIMIT != 4 or SETUP_WAIT_LIMIT != 2:
        raise DriveError("setup probe limits drifted")
    anr_blob = "Pixel Launcher isn't responding\nClose app\nWait"
    if blocker_kind(anr_blob, {"android"}) != "anr":
        raise DriveError("ANR dialog was not a blocker")
    if blocker_kind("Meet Folio\nContinue", {PKG}) is not None:
        raise DriveError("Folio in front was treated as blocked")
    if blocker_kind("Photos", {"com.google.android.apps.nexuslauncher"}) != "launcher":
        raise DriveError("launcher was not a blocker")
    if blocker_kind("", set()) is not None:
        raise DriveError("empty dump should be retried, not recovered")
    if blocker_kind(anr_blob, {PKG, "android"}) != "anr":
        raise DriveError("ANR text must win over a Folio package")
    focused_nodes = [{
        "text": "15000, Expected monthly income (EGP)",
        "class": "android.widget.EditText",
        "focused": True,
    }]
    if not label_focused(focused_nodes, "monthly income"):
        raise DriveError("label_focused missed the income editor")
    if label_focused(focused_nodes, "spending target"):
        raise DriveError("label_focused matched the wrong editor")
    if next_setup_probe(False, False, "anr", 0, 0, 0, clipped=True, anchor=True) != "recover":
        raise DriveError("ANR must be recovered before a tap or scroll")
    if next_setup_probe(True, True, None, 0, 0, 0) != "dismiss-keyboard":
        raise DriveError("keyboard must go away before a tap")
    if next_setup_probe(False, True, None, 0, 0, 0, anchor=True) != "dismiss-keyboard":
        raise DriveError("covered spending target must dismiss the keyboard, not scroll")
    if next_setup_probe(True, False, None, 0, 0, 0) != "tap":
        raise DriveError("a tappable node should be tapped")
    if next_setup_probe(False, False, None, 0, 0, 0, clipped=True) != "scroll":
        raise DriveError("a clipped footer should scroll immediately")
    if next_setup_probe(False, False, None, 0, 0, 0, anchor=True) != "wait":
        raise DriveError("a missing field should be re-dumped before tab or scroll")
    if next_setup_probe(False, False, None, 0, 0, SETUP_WAIT_LIMIT, anchor=True) != "tab":
        raise DriveError("a missing field should tab from the previous field")
    if next_setup_probe(
        False, False, None, 0, SETUP_TAB_LIMIT, SETUP_WAIT_LIMIT, anchor=True,
    ) != "scroll":
        raise DriveError("tab budget should fall through to one scroll")
    if next_setup_probe(
        False, False, None, SETUP_SCROLL_LIMIT, SETUP_TAB_LIMIT, SETUP_WAIT_LIMIT, anchor=True,
    ) != "wait":
        raise DriveError("scroll budget must stop")
    if next_setup_probe(False, False, "launcher", 0, 0, 0) != "recover":
        raise DriveError("launcher should bring Folio forward")
    if upgrade_settled_home("YOUR MONEY, SIMPLIFIED\nMeet Folio.\nContinue"):
        raise DriveError("onboarding eyebrow was treated as the upgraded home")
    if not upgrade_settled_home("Your money, in focus.\nAvailable estimate · EGP 8,420.50\nEdit Carrefour"):
        raise DriveError("upgraded home was not recognized")
    if upgrade_settled_home("Available estimate\nMeet Folio."):
        raise DriveError("onboarding mixed with an estimate was treated as home")
    marker = b"xxCarrefouryy" + "Carrefour".encode("utf-16-le")
    if count_storage_marker(marker, "Carrefour") != 2:
        raise DriveError("storage marker count missed utf-8 or utf-16")
    if count_storage_marker(b"", "Carrefour") != 0 or count_storage_marker(b"v2Onboarded", "Carrefour") != 0:
        raise DriveError("storage marker count false positive")
    print("SELF_CHECK_OK", flush=True)


def upgrade(driver, old_apk, new_apk, expect_old="0.2.33"):
    assert_apk(old_apk)
    assert_apk(new_apk)
    driver.wake()
    driver.read_size()
    driver.note_sdk()
    driver.install(old_apk, replace=False)
    code, name = driver.version_line()
    print("installed old", name, code, flush=True)
    if name != expect_old:
        raise DriveError("expected " + expect_old + ", installed " + name)
    driver.launch()
    driver.wait_for("Meet Folio", timeout=70)
    driver.shot("onboarding")
    if not driver.tap_setup_button(
        "Continue", confirm="available balance", while_text="Meet Folio", forbid=("Android",),
    ):
        raise DriveError("could not tap onboarding Continue")
    driver.fill_labeled("available balance", "8420.50", numeric=True)
    driver.fill_labeled("monthly income", "15000", numeric=True, anchor="available balance")
    driver.fill_labeled("spending target", "9000", numeric=True, anchor="monthly income")
    driver.shot("onboarding-filled")
    if not driver.leave_step("Continue", "Capture only", forbid=("Android",)):
        raise DriveError("could not leave the balance step")
    if not driver.tap_setup_button(
        "Continue", confirm="Open Folio", while_text="Capture only", forbid=("Android",),
    ):
        raise DriveError("could not skip notification access")
    if not driver.tap_setup_button("Open Folio", confirm="in focus", while_text="Open Folio"):
        raise DriveError("could not open Folio")

    driver.scroll_to_top()
    time.sleep(0.4)
    if not driver.tap_control("Add transaction", scrolls=0):
        driver.scroll_to_top()
        if not driver.tap_control("Add transaction", scrolls=0):
            raise DriveError("could not open the transaction form")
    driver.wait_for("New transaction", timeout=15)
    driver.fill_labeled("Merchant or source", "Carrefour")
    driver.hide_keyboard()
    driver.fill_labeled("Amount", "125.50", numeric=True, anchor="Merchant or source")
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
    if not (driver.tap_control("Budgets", scrolls=1) or driver.tap_control("Budget", scrolls=1)):
        raise DriveError("could not show the saved category budget")
    driver.wait_for("Food", timeout=20)

    before_home = ""
    if driver.tap_control("Home", scrolls=1) or driver.tap_control("Overview", scrolls=1):
        time.sleep(1)
    before_home = driver.collect(scrolls=3)
    driver.save_text("before-home.txt", before_home)
    if not (driver.tap_control("Budgets", scrolls=1) or driver.tap_control("Budget", scrolls=1)):
        raise DriveError("could not return to Budgets")
    time.sleep(1)
    before_budget = driver.collect(scrolls=2)
    driver.save_text("before-budget.txt", before_budget)
    assert_entered(driver, before_home, before_budget, "before-upgrade")
    driver.shot("before-upgrade")
    before_disk = driver.require_records_on_disk()

    driver.install(new_apk, replace=True)
    new_code, new_name = driver.version_line()
    print("installed new", new_name, new_code, flush=True)
    if not new_code.isdigit() or int(new_code) <= int(code):
        raise DriveError("upgrade did not raise versionCode (" + code + " -> " + new_code + ")")
    driver.launch()
    probe = driver.wait_for_upgrade_home(timeout=50)
    if not driver.running():
        raise DriveError("Folio process exited after the upgrade launch")
    after_disk = driver.capture_webview_storage("after-upgrade")
    if not upgrade_settled_home(probe):
        onboarding = "meet folio" in probe.lower() and "carrefour" not in probe.lower()
        if onboarding and after_disk["carrefour"]:
            raise DriveError("data is on disk but the UI returned to onboarding")
        if onboarding and before_disk["carrefour"] and after_disk["readable"] and not after_disk["carrefour"]:
            raise DriveError("upgrade storage does not contain the entered records")
        if onboarding:
            raise DriveError("upgrade returned to onboarding and the entered records are not on screen")
        raise DriveError("timed out waiting for the upgraded home")
    after_home = driver.collect(scrolls=3)
    driver.save_text("after-home.txt", after_home)
    if "Meet Folio" in after_home and "Carrefour" not in after_home:
        raise DriveError("upgrade returned to onboarding and the entered records are not on screen")
    if not (driver.tap_control("Budgets", scrolls=1) or driver.tap_control("Budget", scrolls=1)):
        raise DriveError("could not open Budgets after upgrade")
    time.sleep(1)
    after_budget = driver.collect(scrolls=2)
    driver.save_text("after-budget.txt", after_budget)
    assert_entered(driver, after_home, after_budget, "after-upgrade")
    driver.shot("after-upgrade")
    print("UPGRADE_DATA_SURVIVED", new_name, new_code, flush=True)


def launch(driver, apk):
    assert_apk(apk)
    driver.wake()
    driver.read_size()
    driver.note_sdk()
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


def latency_summary(results):
    lines = []
    total = results.get("total_time_ms")
    if total:
        lines.append(
            "LATENCY_TOTALTIME_MS"
            + " api=" + str(results.get("device", {}).get("sdk", "?"))
            + " version=" + str(results.get("version_name"))
            + " n=" + str(total["n"])
            + " median=" + str(total["median"])
            + " min=" + str(total["min"])
            + " max=" + str(total["max"])
            + " spread=" + str(total["spread_max_minus_min"])
            + " values=" + ",".join(str(value) for value in total["values"])
        )
    content = results.get("webview_content_upper_ms")
    if content:
        lines.append(
            "LATENCY_WEBVIEW_CONTENT_UPPER_MS"
            + " n=" + str(content["n"])
            + " median=" + str(content["median"])
            + " min=" + str(content["min"])
            + " max=" + str(content["max"])
            + " spread=" + str(content["spread_max_minus_min"])
            + " values=" + ",".join(str(value) for value in content["values"])
        )
    page = results.get("on_page_finished_ms")
    if page:
        lines.append(
            "LATENCY_ON_PAGE_FINISHED_MS"
            + " n=" + str(page["n"])
            + " median=" + str(page["median"])
            + " values=" + ",".join(str(value) for value in page["values"])
        )
    elif results.get("content_runs"):
        lines.append("LATENCY_ON_PAGE_FINISHED_MS absent")
    if results.get("webview_content_error"):
        lines.append("LATENCY_WEBVIEW_CONTENT_FAILED " + str(results["webview_content_error"]))
    if results.get("error"):
        lines.append("LATENCY_ERROR " + str(results["error"]))
    return "\n".join(lines) + ("\n" if lines else "")


def write_latency(driver, results):
    driver.save_text("latency.json", json.dumps(results, indent=2, sort_keys=True) + "\n")
    text = latency_summary(results)
    driver.save_text("latency.txt", text)
    print(text, flush=True)


def latency(driver, apk, runs, content_runs):
    if runs < 3 or runs > 15:
        raise DriveError("--runs must be from 3 to 15")
    if content_runs < 1 or content_runs > 8:
        raise DriveError("--content-runs must be from 1 to 8")
    assert_apk(apk)
    results = {
        "ok": False,
        "package": PKG,
        "activity": ACTIVITY,
        "apk_sha256": sha256_file(apk),
        "command": "am start -W -n " + ACTIVITY,
        "cold_definition": (
            "am force-stop " + PKG + ", wait until pidof is empty, then sleep 1s. "
            "No drop_caches. The WebView provider process is left running. "
            "One warmup start is recorded and excluded from the median."
        ),
        "animations": "window, transition, and animator scales set to 0",
        "measured_runs": runs,
        "content_runs_requested": content_runs,
        "host": host_facts(),
        "emulator": {
            "api_requested": os.environ.get("FOLIO_EMULATOR_API"),
            "target": os.environ.get("FOLIO_EMULATOR_TARGET"),
            "arch": os.environ.get("FOLIO_EMULATOR_ARCH"),
            "profile": os.environ.get("FOLIO_EMULATOR_PROFILE"),
            "ram_size": os.environ.get("FOLIO_EMULATOR_RAM"),
            "options": os.environ.get("FOLIO_EMULATOR_OPTIONS"),
            "action": os.environ.get("FOLIO_EMULATOR_ACTION"),
            "disable_animations": os.environ.get("FOLIO_DISABLE_ANIMATIONS"),
        },
        "limits": (
            "Numbers are from a GitHub-hosted emulator with animations disabled "
            "and GPU swiftshader, not from a physical phone. TotalTime ends at the "
            "first drawn frame, which is the native loading overlay, not the HTML. "
            "WebView content time is an upper bound from uiautomator dumps taken "
            "after am start -W returns, so the dumps can delay rendering."
        ),
    }
    try:
        driver.wake()
        driver.read_size()
        sdk, release = driver.note_sdk()
        requested = os.environ.get("FOLIO_EMULATOR_API")
        if requested and sdk != requested:
            raise DriveError("emulator sdk " + sdk + " != requested " + requested)
        driver.install(apk, replace=False)
        code, name = driver.version_line()
        print("installed", name, code, flush=True)
        webview = driver.shell("dumpsys webviewupdate", check=False, timeout=40)
        webview_text = webview.stdout or ""
        driver.save_text("webviewupdate.txt", webview_text)
        results.update({
            "version_name": name,
            "version_code": code,
            "device": {
                "sdk": sdk,
                "release": release,
                "abi": driver.prop("ro.product.cpu.abi"),
                "model": driver.prop("ro.product.model"),
                "hardware": driver.prop("ro.hardware"),
                "fingerprint": driver.prop("ro.build.fingerprint"),
                "screen": str(driver.width) + "x" + str(driver.height),
                "window_animation_scale": (
                    driver.shell("settings get global window_animation_scale", check=False).stdout or ""
                ).strip(),
                "transition_animation_scale": (
                    driver.shell("settings get global transition_animation_scale", check=False).stdout or ""
                ).strip(),
                "animator_duration_scale": (
                    driver.shell("settings get global animator_duration_scale", check=False).stdout or ""
                ).strip(),
            },
            "webviewupdate_excerpt": webview_text[:1500],
        })
        if not code.isdigit() or int(code) < 140:
            raise DriveError("expected versionCode >= 140, got " + code)

        driver.settle_stopped()
        warmup = driver.am_start_w()
        results["warmup_excluded"] = {
            "total_time_ms": warmup["total_time_ms"],
            "wait_time_ms": warmup["wait_time_ms"],
            "this_time_ms": warmup["this_time_ms"],
            "launch_state": warmup["launch_state"],
        }
        print("warmup TotalTime", warmup["total_time_ms"], warmup["launch_state"], flush=True)

        samples = []
        attempts = 0
        while len(samples) < runs and attempts < runs + 6:
            attempts += 1
            driver.settle_stopped()
            sample = driver.am_start_w()
            state = (sample["launch_state"] or "").upper()
            if state in {"WARM", "HOT"}:
                print("discard", state, "TotalTime", sample["total_time_ms"], flush=True)
                results.setdefault("discarded_not_cold", []).append({
                    "total_time_ms": sample["total_time_ms"],
                    "launch_state": sample["launch_state"],
                })
                continue
            samples.append({
                "total_time_ms": sample["total_time_ms"],
                "wait_time_ms": sample["wait_time_ms"],
                "this_time_ms": sample["this_time_ms"],
                "launch_state": sample["launch_state"],
            })
            print("cold", len(samples), sample["total_time_ms"], sample["launch_state"], flush=True)
        if len(samples) < runs:
            raise DriveError("only " + str(len(samples)) + " cold starts out of " + str(runs))
        results["cold_runs"] = samples
        results["total_time_ms"] = summarize_ms([sample["total_time_ms"] for sample in samples])
        results["wait_time_ms"] = summarize_ms([sample["wait_time_ms"] for sample in samples])
        this_times = [sample["this_time_ms"] for sample in samples if isinstance(sample["this_time_ms"], int)]
        if len(this_times) == len(samples):
            results["this_time_ms"] = summarize_ms(this_times)
        else:
            results["this_time_note"] = (
                "am start -W did not print ThisTime. TotalTime is the measured value."
            )

        # Content timing is best-effort. A miss must not discard the TotalTime
        # series: the release APK has no render hook, and uiautomator can fail
        # to go idle. The failure is stored beside the cold-start numbers.
        try:
            script_path = driver.artifacts / "webview_time.sh"
            script_path.write_text(webview_shell())
            driver.adb("push", str(script_path), "/data/local/tmp/folio_webview_time.sh")
            content = []
            attempts = 0
            while len(content) < content_runs and attempts < content_runs + 6:
                attempts += 1
                result = driver.adb(
                    "shell", "sh", "/data/local/tmp/folio_webview_time.sh",
                    check=False, timeout=180)
                output = ((result.stdout or "") + "\n" + (result.stderr or "")).strip()
                driver.save_text("content-%02d.txt" % attempts, output + "\n")
                head, startw, poll, logs = parse_content_output(output)
                if result.returncode != 0 or head.get("STARTW_RC") not in (None, "0"):
                    raise DriveError("webview timing shell failed: " + output[-400:])
                started = parse_am_start(startw)
                state = (started["launch_state"] or "").upper()
                if state in {"WARM", "HOT"}:
                    print("content discard", state, flush=True)
                    continue
                found = poll.get("CONTENT_FOUND") == "1"
                upper = None
                lower = None
                if found and head.get("UP_START") and poll.get("UP_SEEN"):
                    upper = uptime_delta_ms(head["UP_START"], poll["UP_SEEN"])
                    if poll.get("UP_PREV"):
                        lower = uptime_delta_ms(head["UP_START"], poll["UP_PREV"])
                deltas = logcat_deltas_ms(logs)
                row = {
                    "total_time_ms": started["total_time_ms"],
                    "launch_state": started["launch_state"],
                    "content_found": found,
                    "content_upper_ms": upper,
                    "content_lower_ms": lower,
                    "dumps": poll.get("DUMPS"),
                    "displayed_ms": deltas["displayed_ms"],
                    "on_page_finished_ms": deltas["on_page_finished_ms"],
                }
                print("content", attempts, row, flush=True)
                if not found:
                    driver.adb(
                        "pull", "/data/local/tmp/folio-ui.xml",
                        str(driver.artifacts / ("content-%02d-ui.xml" % attempts)),
                        check=False)
                    # One API 34 sample can miss Meet Folio after earlier
                    # samples saw it. Retry the cold start; do not drop the
                    # TotalTime series and do not invent a content time.
                    print("content miss", attempts, "dumps", poll.get("DUMPS"), flush=True)
                    continue
                content.append(row)
            if len(content) < content_runs:
                raise DriveError(
                    "WebView text Meet Folio was not in the accessibility tree "
                    + "(" + str(len(content)) + " of " + str(content_runs) + " samples)"
                )
            driver.adb(
                "pull", "/data/local/tmp/folio-ui.xml",
                str(driver.artifacts / "webview-ui.xml"),
                check=False)
            results["content_runs"] = content
            uppers = [row["content_upper_ms"] for row in content if row["content_upper_ms"] is not None]
            if len(uppers) != len(content):
                raise DriveError("content upper bound missing")
            results["webview_content_upper_ms"] = summarize_ms(uppers)
            lowers = [row["content_lower_ms"] for row in content if row["content_lower_ms"] is not None]
            if lowers:
                results["webview_content_lower_ms"] = summarize_ms(lowers)
            finished = [row["on_page_finished_ms"] for row in content if row["on_page_finished_ms"] is not None]
            if finished:
                results["on_page_finished_ms"] = summarize_ms(finished)
            else:
                results["on_page_finished_note"] = (
                    "The release APK does not log onPageFinished. No log line contained "
                    "that marker, so there is no separate WebView callback timestamp."
                )
        except Exception as exc:
            results["webview_content_error"] = str(exc)
            print("WEBVIEW_CONTENT_FAILED", exc, flush=True)
        driver.shot("latency-screen")
        results["ok"] = True
        print("LATENCY_OK", name, code, flush=True)
    except Exception as exc:
        results["error"] = str(exc)
        raise
    finally:
        write_latency(driver, results)


def blank_check(driver, apk):
    """Confirm v0.2.33's page did not render, and do not call that a data pass.

    Android 8's system WebView on the google_apis image is Chrome 69. The
    v0.2.33 inline script uses `??` and `?.`, which that WebView rejects, so
    #root stays empty and the upgrade UI cannot be driven. If the page does
    render, this check fails so the real upgrade test can be put back.
    """
    assert_apk(apk)
    driver.wake()
    driver.read_size()
    sdk, release = driver.note_sdk()
    driver.install(apk, replace=False)
    code, name = driver.version_line()
    print("installed", name, code, "sdk", sdk, release, flush=True)
    if name != "0.2.33":
        raise DriveError("expected v0.2.33, installed " + name)
    webview = driver.shell("dumpsys webviewupdate", check=False, timeout=40)
    driver.save_text("webviewupdate.txt", webview.stdout or "")
    driver.launch()
    deadline = time.time() + 25
    blob = ""
    while time.time() < deadline:
        nodes = driver.dump_nodes()
        blob = driver.blob(nodes)
        if "Meet Folio" in blob:
            driver.save_text("unexpected-render.txt", blob)
            driver.shot("rendered")
            raise DriveError("v0.2.33 rendered Meet Folio; run the upgrade test on this image")
        if "has stopped" in blob or "isn't responding" in blob:
            driver.save_text("crash.txt", blob)
            raise DriveError("v0.2.33 crashed instead of showing a blank page")
        time.sleep(2)
    if not driver.running():
        raise DriveError("v0.2.33 process exited before the page could be checked")
    driver.save_text("observed.txt", blob)
    driver.shot("blank-page")
    if "Folio" not in blob:
        raise DriveError("v0.2.33 did not show its window: " + blob[-300:])
    print("V0233_UI_BLANK", name, code, "sdk", sdk, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("upgrade", "launch", "latency", "blank-check", "self-check"))
    parser.add_argument("--apk")
    parser.add_argument("--old")
    parser.add_argument("--new")
    parser.add_argument("--expect-old", default="0.2.33")
    parser.add_argument("--artifacts")
    parser.add_argument("--runs", type=int, default=7)
    parser.add_argument("--content-runs", type=int, default=5)
    args = parser.parse_args()
    if args.mode == "self-check":
        try:
            self_check()
        except Exception as exc:
            print("FAILED", exc, flush=True)
            return 1
        return 0
    if not args.artifacts:
        print("FAILED --artifacts is required", flush=True)
        return 1
    driver = Driver(Path(args.artifacts))
    try:
        if args.mode == "upgrade":
            if not args.old or not args.new:
                raise DriveError("upgrade needs --old and --new")
            upgrade(driver, args.old, args.new, args.expect_old)
        elif args.mode == "latency":
            if not args.apk:
                raise DriveError("latency needs --apk")
            latency(driver, args.apk, args.runs, args.content_runs)
        elif args.mode == "blank-check":
            if not args.apk:
                raise DriveError("blank-check needs --apk")
            blank_check(driver, args.apk)
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
