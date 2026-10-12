package com.folio.finance;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
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
    /** Package IDs only, after explicit capture opt-in. No notification text is stored. */
    static synchronized void observe(Context c, String pkg) {
        if(pkg==null || !pkg.matches("[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)+")) return;
        SharedPreferences p=prefs(c);
        try {
            JSONArray old=new JSONArray(p.getString("observed_apps","[]"));
            JSONArray next=new JSONArray();
            for(int i=0;i<old.length();i++) if(!pkg.equals(old.optString(i))) next.put(old.optString(i));
            next.put(pkg);
            JSONArray capped=new JSONArray();
            for(int i=Math.max(0,next.length()-25);i<next.length();i++) capped.put(next.getString(i));
            p.edit().putString("observed_apps",capped.toString()).apply();
        }catch(Exception ignored){}
    }
    static synchronized JSONArray getObservedSources(Context c) {
        try{return new JSONArray(prefs(c).getString("observed_apps","[]"));}
        catch(Exception ignored){return new JSONArray();}
    }
    static synchronized void note(Context c,String result) {
        SharedPreferences p=prefs(c);
        SharedPreferences.Editor e=p.edit();
        e.putInt("diag_allowed",p.getInt("diag_allowed",0)+1);
        if("recognized".equals(result))e.putInt("diag_parsed",p.getInt("diag_parsed",0)+1);
        if("duplicate".equals(result))e.putInt("diag_duplicate",p.getInt("diag_duplicate",0)+1);
        if("unrecognized".equals(result)||"empty".equals(result))e.putInt("diag_unrecognized",p.getInt("diag_unrecognized",0)+1);
        e.putLong("diag_last_at",System.currentTimeMillis()).putString("diag_last_result",result).apply();
    }
    static synchronized JSONObject diagnostics(Context c) {
        SharedPreferences p=prefs(c);JSONObject o=new JSONObject();
        try{
            o.put("allowed",p.getInt("diag_allowed",0));
            o.put("parsed",p.getInt("diag_parsed",0));
            o.put("duplicate",p.getInt("diag_duplicate",0));
            o.put("unrecognized",p.getInt("diag_unrecognized",0));
            o.put("lastAt",p.getLong("diag_last_at",0));
            o.put("lastResult",p.getString("diag_last_result",""));
        }catch(Exception ignored){}
        return o;
    }
    static boolean allowed(Context c, String pkg) {
        JSONArray a = getSources(c);
        for (int i=0; i<a.length(); i++) if (pkg.equals(a.optString(i))) return true;
        return false;
    }
    /** @return false when this alert repeats a movement already accepted. Raw text is not stored. */
    static synchronized boolean enqueue(Context c, JSONObject transaction, String normalizedContent) {
        SharedPreferences p = prefs(c);
        long now = System.currentTimeMillis();
        try {
            List<IngestionDedup.Seen> prior = readSeen(p.getString("dedup_seen", "[]"));
            IngestionDedup.Verdict verdict = IngestionDedup.evaluate(prior, now,
                    transaction.optLong("amountMinor"), transaction.optString("currency"),
                    transaction.optString("direction"), transaction.optString("merchant"), normalizedContent);
            SharedPreferences.Editor editor = p.edit().putString("dedup_seen", writeSeen(verdict.retained));
            if (verdict.duplicate) {
                editor.apply();
                return false;
            }
            transaction.put("id", verdict.id);
            transaction.put("dedupKey", verdict.semanticKey);
            JSONArray queue = getPending(c);
            queue.put(transaction);
            JSONArray capped = new JSONArray();
            for (int i = Math.max(0, queue.length() - 400); i < queue.length(); i++) capped.put(queue.get(i));
            editor.putString("queue", capped.toString()).apply();
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }
    private static List<IngestionDedup.Seen> readSeen(String json) {
        ArrayList<IngestionDedup.Seen> out = new ArrayList<>();
        try {
            JSONArray rows = new JSONArray(json);
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) continue;
                out.add(new IngestionDedup.Seen(row.optString("c"), row.optString("k"), row.optString("m"),
                        row.has("r") && !row.isNull("r") ? row.optString("r") : null,
                        row.optLong("t"), row.optString("id")));
            }
        } catch (Exception ignored) { }
        return out;
    }
    private static String writeSeen(List<IngestionDedup.Seen> rows) {
        JSONArray out = new JSONArray();
        if (rows != null) {
            for (IngestionDedup.Seen seen : rows) {
                JSONObject row = new JSONObject();
                try {
                    row.put("c", seen.contentHash);
                    row.put("k", seen.semanticKey);
                    row.put("m", seen.merchant);
                    if (seen.reference != null) row.put("r", seen.reference);
                    row.put("t", seen.at);
                    row.put("id", seen.id);
                    out.put(row);
                } catch (Exception ignored) { }
            }
        }
        return out.toString();
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
    }
