package com.folio.finance;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

/** Local queue: stores only parsed financial fields, not raw notification content. */
final class NativeStore {
    private static final String PREFS = "folio_private_ingestion";
    private static final String DEFAULT_SOURCES = "[\"com.google.android.apps.messaging\",\"com.samsung.android.messaging\",\"com.android.mms\"]";
    private NativeStore() {}
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    static synchronized JSONArray getPending(Context c) {
        try { return new JSONArray(prefs(c).getString("queue", "[]")); }
        catch (Exception ignored) { return new JSONArray(); }
    }
    static boolean isCaptureEnabled(Context c) { return prefs(c).getBoolean("capture", false); }
    static void setCaptureEnabled(Context c, boolean enabled) { prefs(c).edit().putBoolean("capture", enabled).apply(); }
    static void clearQueue(Context c) { prefs(c).edit().remove("queue").remove("last_sig").remove("last_at").apply(); }
    static synchronized JSONArray getSources(Context c) {
        try { return new JSONArray(prefs(c).getString("sources", DEFAULT_SOURCES)); }
        catch (Exception ignored) { return new JSONArray(); }
    }
    static synchronized void setSources(Context c, String json) {
        try {
            JSONArray parsed = new JSONArray(json), valid = new JSONArray();
            for (int i=0; i<parsed.length() && valid.length()<30; i++) {
                String pkg = parsed.optString(i, "").trim();
                if (pkg.matches("[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)+")) valid.put(pkg);
            }
            prefs(c).edit().putString("sources", valid.toString()).apply();
        } catch (Exception ignored) { }
    }
    static boolean allowed(Context c, String pkg) {
        JSONArray a = getSources(c);
        for (int i=0; i<a.length(); i++) if (pkg.equals(a.optString(i))) return true;
        return false;
    }
    static synchronized void enqueue(Context c, JSONObject transaction, String signature) {
        SharedPreferences p = prefs(c);
        long now = System.currentTimeMillis();
        try {
            String key = sha256(signature);
            if (key.equals(p.getString("last_sig", "")) && now-p.getLong("last_at",0)<120000) return;
            JSONArray queue = getPending(c); queue.put(transaction);
            JSONArray capped = new JSONArray();
            for (int i=Math.max(0,queue.length()-400); i<queue.length(); i++) capped.put(queue.get(i));
            p.edit().putString("queue", capped.toString()).putString("last_sig",key).putLong("last_at",now).apply();
        } catch (Exception ignored) { }
    }
    static synchronized void ack(Context c, String idsJson) {
        try {
            JSONArray ids = new JSONArray(idsJson); Set<String> acknowledged = new HashSet<>();
            for(int i=0;i<ids.length();i++) acknowledged.add(ids.optString(i));
            JSONArray old = getPending(c), keep = new JSONArray();
            for(int i=0;i<old.length();i++) {
                JSONObject o=old.getJSONObject(i);
                if (!acknowledged.contains(o.optString("id"))) keep.put(o);
            }
            prefs(c).edit().putString("queue", keep.toString()).apply();
        } catch (Exception ignored) { }
    }
    private static String sha256(String s) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder b=new StringBuilder();for(byte d:digest)b.append(String.format("%02x",d & 255));return b.toString();
        } catch (Exception ignored) { return String.valueOf(s.hashCode()); }
    }
}
