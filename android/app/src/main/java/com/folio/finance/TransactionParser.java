package com.folio.finance;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Offline parser. The transaction amount wins over a stated balance.
 * OTP, authorization holds, failed payments, and balance-only alerts are ignored.
 * The word "pending" alone does not reject a posted or in-progress purchase.
 *
 * <p>Add a row to {@link #EXTENSION_TEMPLATES} when a redacted real SMS arrives.
 * Group {@code amount} is the transaction. Group {@code balance} is optional and is
 * never stored as a transaction. The general classifier still runs when no template matches.
 */
public final class TransactionParser {
    private TransactionParser() {}

    private static final String CURRENCY = "(?:(?<![\\p{L}])(?:EGP|E\\.?G\\.?P\\.?|LE|L\\.E\\.|USD|US\\$|SAR|SR|AED|EUR|GBP)(?![\\p{L}])|\\$|€|£|ج\\.?\\s*م\\.?|جنيه|جنيها|جنيهات|ر\\.?\\s*س\\.?|ريال|درهم)";
    private static final String NUM = "(?:[0-9]{1,3}(?:[,][0-9]{3})+(?:\\.[0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)";
    private static final Pattern CUR_FIRST = Pattern.compile("(?iu)(?<![\\p{L}\\p{N}])(" + CURRENCY + ")\\s*:?\\s*(" + NUM + ")");
    private static final Pattern NUM_FIRST = Pattern.compile("(?iu)(?<![\\p{L}\\p{N}])(" + NUM + ")\\s*(" + CURRENCY + ")(?![\\p{L}])");
    private static final String EXPENSE_EN = "spent|purchase|purchased|paid|payment|debited|debit alert|withdrawn|withdrawal|charged|card transaction|pos transaction|sent|card (?:was )?used|used (?:your )?card|successful purchase|transferred out";
    private static final String EXPENSE_AR = "تم\\s+خصم|خصم|سحب|تم\\s+سحب|شراء|دفع|تم\\s+دفع|مدفوعات|عملية شرائية|تم\\s+تحويل(?!.{0,40}(?:إلى|الى)\\s+حساب)";
    private static final String INCOME_EN = "received|credited|credit alert|deposited|deposit|salary|refund|refunded|cashback|incoming transfer|transfer received|money received|funds received";
    private static final String INCOME_AR = "إيداع|ايداع|استلام|استرداد|إضافة|اضافة|تحويل وارد|تم\\s+اضافة|تم\\s+إضافة|تم\\s+إيداع|حوالة واردة|تم\\s+تحويل.{0,80}(?:إلى|الى)\\s+حسابك";
    private static final String EXPENSE_SRC = "(?:\\b(?:" + EXPENSE_EN + ")\\b|(?:" + EXPENSE_AR + "))";
    private static final String INCOME_SRC = "(?:\\b(?:" + INCOME_EN + ")\\b|(?:" + INCOME_AR + "))";
    private static final Pattern EXPENSE = Pattern.compile("(?iu)" + EXPENSE_SRC);
    private static final Pattern INCOME = Pattern.compile("(?iu)" + INCOME_SRC);
    private static final Pattern VERB = Pattern.compile("(?iu)(?:" + EXPENSE_SRC + "|" + INCOME_SRC + ")");
    /** Balance words. Longer phrases are listed before the shorter ones they contain. */
    private static final String BALANCE_SRC = "available\\s+balance|avl\\.?\\s*bal\\.?|avail\\.?\\s*bal(?:ance)?|remaining\\s+balance|current\\s+balance|account\\s+balance|book\\s+balance|\\bbalance\\b|\\bremaining\\b|الرصيد\\s+المتبقي|الرصيد\\s+المتاح|الرصيد\\s+الحالي|رصيدك\\s+الحالي|رصيدك|الرصيد|المتاح|المتبقي|متبقي|رصيد";
    private static final Pattern BALANCE_WORD = Pattern.compile("(?iu)(?:" + BALANCE_SRC + ")");
    /** Reject secrets and failures. "pending" is intentionally absent so a real purchase that is still pending is kept. */
    private static final Pattern REJECT = Pattern.compile("(?iu)\\b(?:otp|one[\\s-]?time[\\s-]?(?:password|pin|passcode)|verification code|security code|declined|failed|rejected|unsuccessful|not approved|not authorized|not authorised|cancelled|canceled|voided|authorization only|authorisation only|available balance only|insufficient funds|could not be processed|was not completed)\\b|(?:رمز التحقق|كود التحقق|رمز سري|كلمة المرور المؤقتة|لم تتم|مرفوض|مرفوضة|فشلت|رصيدك فقط|لم تنجح|غير ناجحة|لم يتم الخصم)");
    private static final Pattern AUTH_ONLY = Pattern.compile("(?iu)(?:pre[-\\s]?authori[sz]ation|authori[sz]ation\\s+(?:only|hold|request)|\\bauth\\s+hold\\b|pending\\s+authori[sz]ation|تفويض\\s+(?:فقط|مسبق)|عملية\\s+تفويض)");
    private static final Pattern SETTLED = Pattern.compile("(?iu)\\b(?:charged|debited|deducted|purchased|withdrawn|withdrawal|paid|sent|credited|deposited|deposit|refunded|refund|cashback|received)\\b|(?:خصم|سحب|شراء|تم\\s+دفع|إيداع|ايداع|استلام|استرداد)");
    private static final Pattern MERCHANT = Pattern.compile("(?iu)\\b(?:at|from|to|merchant|via)\\s+([^.;\\n]{2,55})|(?:لدى|عند|من|إلى)\\s+([^.;\\n]{2,55})");
    private static final Pattern CURRENCY_TOKEN = Pattern.compile("(?iu)(" + CURRENCY + ")");
    private static final int CONTEXT = 80;
    private static final String AMOUNT_SLOT = "(?:(?:" + CURRENCY + ")\\s*)?(" + NUM + ")(?:\\s*(?:" + CURRENCY + "))?";

    /**
     * Extension point for a redacted SMS. Group 1 is the transaction amount and group 2 is the
     * stated balance. Currency may sit on either side of either number. Add a pattern; do not
     * store the balance group as a transaction.
     */
    private static final Pattern[] EXTENSION_TEMPLATES = new Pattern[] {
        Pattern.compile("(?ius)(?:" + EXPENSE_SRC + "|" + INCOME_SRC + ").{0,48}?" + AMOUNT_SLOT + ".{0,100}?(?:" + BALANCE_SRC + ").{0,28}?" + AMOUNT_SLOT),
        Pattern.compile("(?ius)(?:" + BALANCE_SRC + ").{0,28}?" + AMOUNT_SLOT + ".{0,100}?(?:" + EXPENSE_SRC + "|" + INCOME_SRC + ").{0,48}?" + AMOUNT_SLOT)
    };

    public static final class ParsedTransaction {
        public final long amountMinor;
        public final String currency, direction, merchant, category;
        /** "high" when one amount is clearly the transaction. "low" when the choice is ambiguous. */
        public final String confidence;
        public final boolean ambiguous;
        /** Stated balance from the alert, or null. This is not a transaction. */
        public final Long statedBalanceMinor;
        public final String statedBalanceCurrency;

        ParsedTransaction(long amountMinor, String currency, String direction, String merchant, String category,
                          String confidence, boolean ambiguous, Long statedBalanceMinor, String statedBalanceCurrency) {
            this.amountMinor = amountMinor;
            this.currency = currency;
            this.direction = direction;
            this.merchant = merchant;
            this.category = category;
            this.confidence = confidence;
            this.ambiguous = ambiguous;
            this.statedBalanceMinor = statedBalanceMinor;
            this.statedBalanceCurrency = statedBalanceCurrency;
        }
    }

    private enum Role { TXN, BALANCE, AMBIGUOUS, NONE }

    public static ParsedTransaction parse(String title, String body) {
        if (body == null || body.trim().isEmpty()) return null;
        String normalized = normalize((title == null ? "" : title) + " " + body);
        if (REJECT.matcher(normalized).find()) return null;
        if (AUTH_ONLY.matcher(normalized).find() && !SETTLED.matcher(normalized).find()) return null;
        String direction = direction(normalized);
        if (direction == null) return null;
        ParsedTransaction templated = fromTemplate(normalized, direction);
        if (templated != null) return templated;
        return fromHeuristic(normalized, direction);
    }

    static String normalize(String s) {
        String n = Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFKC);
        StringBuilder out = new StringBuilder(n.length());
        for (int i = 0; i < n.length(); i++) {
            char c = n.charAt(i);
            int d = Character.digit(c, 10);
            if (d >= 0 && d <= 9 && (c < '0' || c > '9')) out.append((char) ('0' + d));
            else if (c == '٫') out.append('.');
            else if (c == '٬' || c == '\u00A0' || c == '\u202F') out.append(',');
            else out.append(c);
        }
        return out.toString();
    }

    private static String direction(String text) {
        boolean debit = EXPENSE.matcher(text).find();
        boolean credit = INCOME.matcher(text).find();
        if (debit == credit) return null;
        return debit ? "expense" : "income";
    }

    private static final class MoneyHit {
        final int start;
        final int end;
        final String currencyRaw;
        final String amountRaw;
        final Role role;
        MoneyHit(int start, int end, String currencyRaw, String amountRaw, Role role) {
            this.start = start;
            this.end = end;
            this.currencyRaw = currencyRaw;
            this.amountRaw = amountRaw;
            this.role = role;
        }
    }

    private static ParsedTransaction fromTemplate(String text, String direction) {
        for (int i = 0; i < EXTENSION_TEMPLATES.length; i++) {
            Matcher matcher = EXTENSION_TEMPLATES[i].matcher(text);
            if (!matcher.find()) continue;
            boolean balanceFirst = i == 1;
            String amountRaw = balanceFirst ? matcher.group(2) : matcher.group(1);
            String balanceRaw = balanceFirst ? matcher.group(1) : matcher.group(2);
            int amountStart = balanceFirst ? matcher.start(2) : matcher.start(1);
            int amountEnd = balanceFirst ? matcher.end(2) : matcher.end(1);
            int balanceStart = balanceFirst ? matcher.start(1) : matcher.start(2);
            int balanceEnd = balanceFirst ? matcher.end(1) : matcher.end(2);
            String currency = currencyNear(text, amountStart, amountEnd);
            if (currency == null) currency = currencyNear(text, balanceStart, balanceEnd);
            if (currency == null) currency = soleCurrency(text);
            Long minor = toMinor(amountRaw);
            if (minor == null || currency == null) continue;
            Long stated = toMinor(balanceRaw);
            String statedCurrency = stated == null ? null : currencyNear(text, balanceStart, balanceEnd);
            if (stated != null && statedCurrency == null) statedCurrency = currency;
            return build(text, direction, minor, currency, "high", false, stated, statedCurrency);
        }
        return null;
    }

    private static ParsedTransaction fromHeuristic(String text, String direction) {
        ArrayList<MoneyHit> hits = new ArrayList<>();
        collectCurrency(text, hits);
        collectBare(text, hits);
        MoneyHit chosen = null;
        int chosenDistance = Integer.MAX_VALUE;
        long txnMinor = -1;
        boolean txnMixed = false;
        for (MoneyHit hit : hits) {
            if (hit.role != Role.TXN && hit.role != Role.AMBIGUOUS) continue;
            Long minor = toMinor(hit.amountRaw);
            if (minor == null) continue;
            if (hit.role == Role.TXN) {
                if (txnMinor < 0) txnMinor = minor;
                else if (txnMinor != minor) txnMixed = true;
            }
            int distance = verbDistance(text, hit.start);
            boolean betterRole = chosen != null && chosen.role != Role.TXN && hit.role == Role.TXN;
            boolean worseRole = chosen != null && chosen.role == Role.TXN && hit.role != Role.TXN;
            if (chosen == null || betterRole || (!worseRole && distance < chosenDistance)) {
                chosen = hit;
                chosenDistance = distance;
            }
        }
        if (chosen == null) return null;
        Long minor = toMinor(chosen.amountRaw);
        String currency = canonicalCurrency(chosen.currencyRaw);
        if (currency == null) currency = soleCurrency(text);
        if (minor == null || currency == null) return null;
        boolean ambiguous = chosen.role != Role.TXN || txnMixed;
        String confidence = ambiguous ? "low" : "high";
        MoneyHit balance = selectBalance(text, hits, chosen);
        Long stated = null;
        String statedCurrency = null;
        if (balance != null) {
            stated = toMinor(balance.amountRaw);
            statedCurrency = canonicalCurrency(balance.currencyRaw);
            if (statedCurrency == null) statedCurrency = currency;
            if (stated == null) statedCurrency = null;
        }
        return build(text, direction, minor, currency, confidence, ambiguous, stated, statedCurrency);
    }

    private static ParsedTransaction build(String text, String direction, long minor, String currency,
                                           String confidence, boolean ambiguous, Long stated, String statedCurrency) {
        String merchant = extractMerchant(text, direction);
        return new ParsedTransaction(minor, currency, direction, merchant, category(merchant, text, direction),
                confidence, ambiguous, stated, stated == null ? null : statedCurrency);
    }

    private static void collectCurrency(String text, ArrayList<MoneyHit> hits) {
        collectPattern(text, CUR_FIRST, true, hits);
        collectPattern(text, NUM_FIRST, false, hits);
    }

    private static void collectPattern(String text, Pattern pattern, boolean currencyFirst, ArrayList<MoneyHit> hits) {
        Matcher matcher = pattern.matcher(text);
        while (matcher.find()) {
            int start = currencyFirst ? matcher.start(2) : matcher.start(1);
            int end = currencyFirst ? matcher.end(2) : matcher.end(1);
            if (overlaps(hits, start, end)) continue;
            if (looksLikeDate(text, start, end)) continue;
            String currency = currencyFirst ? matcher.group(1) : matcher.group(2);
            String amount = currencyFirst ? matcher.group(2) : matcher.group(1);
            hits.add(new MoneyHit(start, end, currency, amount, roleAt(text, start, end)));
        }
    }

    /** A number tied to a transaction verb when the currency is elsewhere in the message. */
    private static void collectBare(String text, ArrayList<MoneyHit> hits) {
        String currency = soleCurrency(text);
        if (currency == null) return;
        Matcher matcher = Pattern.compile("(?iu)(?:" + EXPENSE_SRC + "|" + INCOME_SRC + ")(?:\\s+\\p{L}+){0,4}\\s+(" + NUM + ")(?![\\p{N}])").matcher(text);
        while (matcher.find()) {
            int start = matcher.start(1);
            int end = matcher.end(1);
            if (overlaps(hits, start, end) || looksLikeDate(text, start, end)) continue;
            String raw = matcher.group(1);
            if (raw.replaceAll("[^0-9]", "").length() > 8 && raw.indexOf('.') < 0 && raw.indexOf(',') < 0) continue;
            hits.add(new MoneyHit(start, end, currency, raw, roleAt(text, start, end)));
        }
    }

    private static boolean overlaps(ArrayList<MoneyHit> hits, int start, int end) {
        for (MoneyHit hit : hits) if (start < hit.end && hit.start < end) return true;
        return false;
    }

    private static boolean looksLikeDate(String text, int start, int end) {
        if (start > 0 && text.charAt(start - 1) == '/') return true;
        if (end < text.length() && text.charAt(end) == '/') return true;
        return false;
    }

    /**
     * The keyword immediately before the amount decides. A balance word that introduces
     * the amount wins over a verb farther back in the same clause, and the reverse.
     */
    private static Role roleAt(String text, int start, int end) {
        int clauseFrom = clauseStart(text, start);
        int clauseTo = clauseEnd(text, end);
        int prefixFrom = Math.max(clauseFrom, start - 60);
        String prefix = text.substring(prefixFrom, start);
        int balanceEnd = lastEnd(BALANCE_WORD, prefix);
        int verbEnd = lastEnd(VERB, prefix);
        if (balanceEnd >= 0 || verbEnd >= 0) {
            if (balanceEnd >= 0 && verbEnd >= 0 && Math.abs(balanceEnd - verbEnd) <= 1) return Role.AMBIGUOUS;
            if (balanceEnd > verbEnd) return Role.BALANCE;
            return Role.TXN;
        }
        int suffixTo = Math.min(clauseTo, end + 32);
        String suffix = text.substring(end, suffixTo);
        int balanceAfter = firstStart(BALANCE_WORD, suffix);
        int verbAfter = firstStart(VERB, suffix);
        if (balanceAfter >= 0 && (verbAfter < 0 || balanceAfter < verbAfter)) return Role.BALANCE;
        if (verbAfter >= 0 && (balanceAfter < 0 || verbAfter < balanceAfter)) return Role.TXN;
        int balanceDistance = nearest(BALANCE_WORD, text, start);
        int verbDistance = nearest(VERB, text, start);
        if (verbDistance >= 0 && (balanceDistance < 0 || verbDistance + 4 < balanceDistance)) return Role.TXN;
        if (balanceDistance >= 0 && (verbDistance < 0 || balanceDistance <= verbDistance)) return Role.BALANCE;
        return Role.NONE;
    }

    private static MoneyHit selectBalance(String text, ArrayList<MoneyHit> hits, MoneyHit chosen) {
        MoneyHit best = null;
        int bestDistance = Integer.MAX_VALUE;
        for (MoneyHit hit : hits) {
            if (hit == chosen || hit.role != Role.BALANCE) continue;
            int distance = nearest(BALANCE_WORD, text, hit.start);
            if (distance < 0) distance = CONTEXT;
            if (distance < bestDistance) {
                best = hit;
                bestDistance = distance;
            }
        }
        return best;
    }

    private static int verbDistance(String text, int anchor) {
        int distance = nearest(VERB, text, anchor);
        return distance < 0 ? CONTEXT + 1 : distance;
    }

    private static int lastEnd(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        int end = -1;
        while (matcher.find()) end = matcher.end();
        return end;
    }

    private static int firstStart(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? matcher.start() : -1;
    }

    private static int nearest(Pattern pattern, String text, int anchor) {
        Matcher matcher = pattern.matcher(text);
        int best = -1;
        while (matcher.find()) {
            int distance = Math.abs(matcher.start() - anchor);
            if (distance <= CONTEXT && (best < 0 || distance < best)) best = distance;
        }
        return best;
    }

    private static int clauseStart(String text, int index) {
        for (int i = index - 1; i >= 0; i--) {
            if (isClauseBreak(text, i)) return i + 1;
        }
        return 0;
    }

    private static int clauseEnd(String text, int index) {
        for (int i = index; i < text.length(); i++) {
            if (isClauseBreak(text, i)) return i;
        }
        return text.length();
    }

    private static boolean isClauseBreak(String text, int i) {
        char c = text.charAt(i);
        if (c == '\n' || c == '؛' || c == ';' || c == '!' || c == '?' || c == '،') return true;
        if (c != '.') return false;
        boolean digitBefore = i > 0 && Character.isDigit(text.charAt(i - 1));
        boolean digitAfter = i + 1 < text.length() && Character.isDigit(text.charAt(i + 1));
        return !digitBefore || !digitAfter;
    }

    private static String currencyNear(String text, int start, int end) {
        int from = Math.max(0, start - 16);
        int to = Math.min(text.length(), end + 16);
        String window = text.substring(from, to);
        Matcher matcher = CURRENCY_TOKEN.matcher(window);
        String best = null;
        int bestDistance = Integer.MAX_VALUE;
        while (matcher.find()) {
            String currency = canonicalCurrency(matcher.group(1));
            if (currency == null) continue;
            int mid = from + (matcher.start() + matcher.end()) / 2;
            int distance = mid < start ? start - mid : mid > end ? mid - end : 0;
            if (distance < bestDistance) {
                best = currency;
                bestDistance = distance;
            }
        }
        return best;
    }

    private static String soleCurrency(String text) {
        Matcher matcher = CURRENCY_TOKEN.matcher(text);
        String found = null;
        while (matcher.find()) {
            String currency = canonicalCurrency(matcher.group(1));
            if (currency == null) continue;
            if (found == null) found = currency;
            else if (!found.equals(currency)) return null;
        }
        return found;
    }

    private static Long toMinor(String raw) {
        if (raw == null) return null;
        String plain = raw.trim();
        if (plain.matches("[0-9]{1,3}(?:,[0-9]{3})+(?:\\.[0-9]{1,2})?")) plain = plain.replace(",", "");
        else if (plain.matches("[0-9]+,[0-9]{1,2}")) plain = plain.replace(',', '.');
        else plain = plain.replace(",", "");
        try {
            long minor = new BigDecimal(plain).movePointRight(2).setScale(0, RoundingMode.UNNECESSARY).longValueExact();
            if (minor <= 0 || minor > 10_000_000_000_00L) return null;
            return minor;
        } catch (Exception e) {
            return null;
        }
    }

    private static String canonicalCurrency(String s) {
        if (s == null) return null;
        String value = s.toUpperCase(Locale.ROOT).replace(".", "").replace(" ", "").trim();
        if (value.equals("EGP") || value.equals("LE") || value.contains("جنيه") || value.contains("جم")) return "EGP";
        if (value.equals("USD") || value.equals("US$") || value.equals("$")) return "USD";
        if (value.equals("SAR") || value.equals("SR") || value.contains("ريال") || value.equals("رس")) return "SAR";
        if (value.equals("AED") || value.contains("درهم")) return "AED";
        if (value.equals("EUR") || value.equals("€")) return "EUR";
        if (value.equals("GBP") || value.equals("£")) return "GBP";
        return null;
    }

    private static String extractMerchant(String message, String direction) {
        Matcher matcher = MERCHANT.matcher(message);
        if (matcher.find()) {
            String raw = matcher.group(1) != null ? matcher.group(1) : matcher.group(2);
            raw = raw.replaceAll("(?iu)\\s+(?:on|using|with|ending|card|account|balance|ref|reference|at)\\b.*$", "")
                    .replaceAll("(?iu)\\b(?:EGP|USD|SAR|LE)\\s*[\\d,.]+.*$", "").trim();
            if (raw.length() >= 2 && raw.length() <= 55 && !raw.matches(".*\\d{6,}.*")) return raw;
        }
        return direction.equals("income") ? "Incoming transfer" : "Card payment";
    }

    private static String category(String merchant, String body, String direction) {
        String s = (merchant + " " + body).toLowerCase(Locale.ROOT);
        if (direction.equals("income")) {
            if (s.matches("(?s).*(refund|refunded|cashback|استرداد).*")) return "Refunds";
            if (s.matches("(?s).*(salary|payroll|راتب|مرتب).*")) return "Salary";
            return "Other income";
        }
        if (s.matches("(?s).*(uber|careem|metro|fuel|petrol|gas station|transport|بنزين|مواصلات).*")) return "Transport";
        if (s.matches("(?s).*(amazon|noon|jumia|mall|fashion|clothes|zara|shopping).*")) return "Shopping";
        if (s.matches("(?s).*(restaurant|cafe|coffee|starbucks|mcdonald|kfc|talabat|breadfast|food|مطعم|كافيه).*")) return "Food & drinks";
        if (s.matches("(?s).*(netflix|spotify|youtube|subscription|apple.com/bill|google one).*")) return "Subscriptions";
        if (s.matches("(?s).*(electric|water bill|gas bill|internet|telecom|vodafone|orange|we internet|utility).*")) return "Bills & utilities";
        if (s.matches("(?s).*(pharmacy|hospital|clinic|doctor|صيدلية|مستشفى).*")) return "Health";
        return "Other";
    }
}
