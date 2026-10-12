package com.folio.finance;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Decides whether a parsed notification is the same money movement already recorded.
 *
 * <p>Rule, in order:
 * <ol>
 *   <li>Identical normalized message text (SHA-256, source package ignored) seen in the last 24 hours
 *       is one event. This covers the same SMS delivered by two apps and a notification that is reposted later.</li>
 *   <li>The same amount, currency, direction and compatible merchant within 90 seconds is one event,
 *       unless both messages carry a reference token and those tokens differ. Compatible means the merchant
 *       strings are equal, one contains the other, or either is the generic label "Card payment" or "Incoming transfer".</li>
 *   <li>Anything else is a separate purchase, including the same amount at the same merchant more than 90 seconds apart
 *       when the message text differs. A bank alert with no timestamp and no reference can still be collapsed for 24 hours
 *       if a later alert repeats the text exactly; that is deliberate so a repost is not booked twice.</li>
 * </ol>
 * Raw notification text is not stored. The rolling memory keeps at most 200 hashes, semantic keys, merchant labels,
 * optional reference tokens and timestamps.
 */
public final class IngestionDedup {
    public static final long CONTENT_TTL_MS = 24L * 60L * 60L * 1000L;
    public static final long SEMANTIC_WINDOW_MS = 90L * 1000L;
    public static final int MAX_ENTRIES = 200;
    private static final Pattern REF = Pattern.compile("(?iu)(?:\\b(?:ref(?:erence)?|rrn|txn|auth(?:orization|orisation)?\\s*code|approval\\s*code)\\b|مرجع|رقم\\s*العملية)\\s*[:#№\\-]*\\s*([A-Z0-9]{4,24})");

    private IngestionDedup() {}

    public static final class Seen {
        public final String contentHash;
        public final String semanticKey;
        public final String merchant;
        public final String reference;
        public final long at;
        public final String id;

        public Seen(String contentHash, String semanticKey, String merchant, String reference, long at, String id) {
            this.contentHash = contentHash;
            this.semanticKey = semanticKey;
            this.merchant = merchant;
            this.reference = reference;
            this.at = at;
            this.id = id;
        }
    }

    public static final class Verdict {
        public final boolean duplicate;
        public final String id;
        public final String semanticKey;
        public final String contentHash;
        public final List<Seen> retained;

        Verdict(boolean duplicate, String id, String semanticKey, String contentHash, List<Seen> retained) {
            this.duplicate = duplicate;
            this.id = id;
            this.semanticKey = semanticKey;
            this.contentHash = contentHash;
            this.retained = retained;
        }
    }

    public static String normalizeContent(String text) {
        String folded = TransactionParser.normalize(text == null ? "" : text);
        return folded.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
    }

    public static String semanticKey(long amountMinor, String currency, String direction, String merchant) {
        return amountMinor + "|" + token(currency) + "|" + token(direction) + "|" + normMerchant(merchant).replace('|', '/');
    }

    public static Verdict evaluate(List<Seen> prior, long now, long amountMinor, String currency, String direction, String merchant, String content) {
        String normalized = normalizeContent(content);
        String contentHash = sha256(normalized);
        String merchantKey = normMerchant(merchant);
        String semantic = semanticKey(amountMinor, currency, direction, merchant);
        String reference = referenceToken(normalized);
        ArrayList<Seen> live = new ArrayList<>();
        if (prior != null) {
            for (Seen seen : prior) {
                if (seen == null || seen.contentHash == null || seen.id == null) continue;
                if (now - seen.at > CONTENT_TTL_MS || now < seen.at) continue;
                live.add(seen);
            }
        }
        if (live.size() > MAX_ENTRIES) live = new ArrayList<>(live.subList(live.size() - MAX_ENTRIES, live.size()));
        for (Seen seen : live) {
            if (contentHash.equals(seen.contentHash)) return new Verdict(true, seen.id, semantic, contentHash, live);
            if (now - seen.at <= SEMANTIC_WINDOW_MS && semanticMoneyEquals(seen.semanticKey, semantic) && merchantsCompatible(seen.merchant, merchantKey)) {
                boolean distinctRefs = reference != null && seen.reference != null && !reference.equals(seen.reference);
                if (!distinctRefs) return new Verdict(true, seen.id, semantic, contentHash, live);
            }
        }
        String id = "fp-" + sha256(semantic + "|" + contentHash).substring(0, 32);
        live.add(new Seen(contentHash, semantic, merchantKey, reference, now, id));
        if (live.size() > MAX_ENTRIES) live = new ArrayList<>(live.subList(live.size() - MAX_ENTRIES, live.size()));
        return new Verdict(false, id, semantic, contentHash, live);
    }

    static String referenceToken(String normalizedLower) {
        if (normalizedLower == null || normalizedLower.isEmpty()) return null;
        Matcher matcher = REF.matcher(normalizedLower);
        if (!matcher.find()) return null;
        return matcher.group(1).toUpperCase(Locale.ROOT);
    }

    private static boolean semanticMoneyEquals(String left, String right) {
        if (left == null || right == null) return false;
        int leftCut = left.lastIndexOf('|');
        int rightCut = right.lastIndexOf('|');
        if (leftCut < 0 || rightCut < 0) return left.equals(right);
        return left.substring(0, leftCut).equals(right.substring(0, rightCut));
    }

    public static boolean merchantsCompatible(String left, String right) {
        String a = normMerchant(left);
        String b = normMerchant(right);
        if (a.equals(b)) return true;
        if (isGeneric(a) || isGeneric(b)) return true;
        return a.length() >= 4 && b.length() >= 4 && (a.contains(b) || b.contains(a));
    }

    private static boolean isGeneric(String merchant) {
        return merchant.isEmpty() || merchant.equals("card payment") || merchant.equals("incoming transfer");
    }

    private static String normMerchant(String merchant) {
        return token(merchant).replaceAll("[^\\p{L}\\p{N} ]", " ").replaceAll("\\s+", " ").trim();
    }

    private static String token(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).trim();
    }

    static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(digest.length * 2);
            for (byte b : digest) builder.append(String.format("%02x", b & 255));
            return builder.toString();
        } catch (Exception e) {
            return Integer.toHexString(value.hashCode());
        }
    }
}
