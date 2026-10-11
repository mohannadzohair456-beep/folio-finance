package com.folio.finance;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
/** Offline parser: ignores ambiguous, declined, and one-time-password alerts. */
public final class TransactionParser {
    private TransactionParser() {}
    private static final String CURRENCY = "(?:EGP|E\\.?G\\.?P\\.?|LE|L\\.E\\.|ج\\.?م\\.?|جنيه|جنيها|USD|US\\$|\\$|SAR|SR|ر\\.?س\\.?|ريال|AED|درهم|EUR|€|GBP|£)";
    private static final String NUMBER = "([0-9]{1,3}(?:[,][0-9]{3})+(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)";
    private static final Pattern CUR_FIRST = Pattern.compile("(?i)(?<![\\p{L}\\p{N}])(" + CURRENCY + ")\\s*[:]?\\s*" + NUMBER);
    private static final Pattern NUM_FIRST = Pattern.compile("(?i)(?<![\\p{L}\\p{N}])" + NUMBER + "\\s*(" + CURRENCY + ")(?![\\p{L}])");
    private static final Pattern EXPENSE = Pattern.compile("(?iu)\\b(?:spent|purchase|purchased|paid|payment|debited|debit alert|withdrawn|withdrawal|charged|card transaction|pos transaction|sent|card (?:was )?used|used (?:your )?card|successful purchase|transferred out)\\b|(?:خصم|سحب|شراء|دفع|مدفوعات|عملية شرائية|تم تحويل مبلغ من حسابك)");
    private static final Pattern INCOME = Pattern.compile("(?iu)\\b(?:received|credited|credit alert|deposited|deposit|salary|refund|refunded|cashback|incoming transfer|transfer received|money received|funds received)\\b|(?:إيداع|ايداع|استلام|استرداد|إضافة|اضافة|تحويل وارد|تم اضافة|تم إيداع|حوالة واردة|تم تحويل.*إلى حسابك)");
    private static final Pattern REJECT = Pattern.compile("(?iu)\\b(?:otp|one.time.password|verification code|security code|declined|failed|rejected|unsuccessful|pending|not approved|not authorized|not authorised|cancelled|canceled|voided|authorization only|authorisation only|available balance only)\\b|(?:رمز التحقق|كود التحقق|لم تتم|مرفوض|فشلت|رصيدك فقط)");
    private static final Pattern MERCHANT = Pattern.compile("(?iu)\\b(?:at|from|to|merchant|via)\\s+([^.;,\\n]{2,55})|(?:لدى|عند|من|إلى)\\s+([^.;,\\n]{2,55})");
    public static final class ParsedTransaction {
        public final long amountMinor;
        public final String currency, direction, merchant, category;
        ParsedTransaction(long amountMinor,String currency,String direction,String merchant,String category) {
            this.amountMinor=amountMinor;this.currency=currency;this.direction=direction;this.merchant=merchant;this.category=category;
        }
    }
    public static ParsedTransaction parse(String title,String body) {
        if(body==null||body.isBlank())return null;
        String normalized=normalize((title==null?"":title)+" "+body);
        if(REJECT.matcher(normalized).find())return null;
        boolean debit=EXPENSE.matcher(normalized).find(), credit=INCOME.matcher(normalized).find();
        if(debit==credit)return null;
        Matcher first=CUR_FIRST.matcher(normalized),second=NUM_FIRST.matcher(normalized);
        String cur=null,amount=null;
        if(first.find()){cur=first.group(1);amount=first.group(2);}
        else if(second.find()){amount=second.group(1);cur=second.group(2);}
        if(amount==null)return null;
        String currency=canonicalCurrency(cur);if(currency==null)return null;
        long minor;
        try{minor=new BigDecimal(amount.replace(",","")).movePointRight(2).setScale(0,RoundingMode.UNNECESSARY).longValueExact();}
        catch(Exception e){return null;}
        if(minor<=0||minor>10_000_000_000_00L)return null;
        String direction=debit?"expense":"income";
        String merchant=extractMerchant(normalized,direction);
        return new ParsedTransaction(minor,currency,direction,merchant,category(merchant,normalized,direction));
    }
    static String normalize(String s){
        String n=Normalizer.normalize(s,Normalizer.Form.NFKC);
        StringBuilder out=new StringBuilder(n.length());
        for(int i=0;i<n.length();i++){
            char c=n.charAt(i);int d=Character.digit(c,10);
            if(d>=0)out.append((char)('0'+d));
            else if(c=='٫')out.append('.');
            else if(c=='٬')out.append(',');
            else out.append(c);
        }
        return out.toString();
    }
    private static String canonicalCurrency(String s){
        String value=s.toUpperCase(Locale.ROOT).replace(".","").trim();
        if(value.equals("EGP")||value.equals("LE")||value.contains("جنيه")||value.contains("جم"))return "EGP";
        if(value.equals("USD")||value.equals("US$")||value.equals("$"))return "USD";
        if(value.equals("SAR")||value.equals("SR")||value.contains("ريال")||value.equals("رس"))return "SAR";
        if(value.equals("AED")||value.contains("درهم"))return "AED";
        if(value.equals("EUR")||value.equals("€"))return "EUR";
        if(value.equals("GBP")||value.equals("£"))return "GBP";
        return null;
    }
    private static String extractMerchant(String message,String direction){
        Matcher matcher=MERCHANT.matcher(message);
        if(matcher.find()){
            String raw=matcher.group(1)!=null?matcher.group(1):matcher.group(2);
            raw=raw.replaceAll("(?iu)\\s+(?:on|using|with|ending|card|account|balance|ref|reference|at)\\b.*$","")
                   .replaceAll("(?iu)\\b(?:EGP|USD|SAR|LE)\\s*[\\d,.]+.*$","").trim();
            if(raw.length()>=2&&raw.length()<=55&&!raw.matches(".*\\d{6,}.*"))return raw;
        }
        return direction.equals("income")?"Incoming transfer":"Card payment";
    }
    private static String category(String merchant,String body,String direction){
        String s=(merchant+" "+body).toLowerCase(Locale.ROOT);
        if(direction.equals("income")){
            if(s.matches("(?s).*(refund|refunded|cashback|استرداد).*"))return "Refunds";
            if(s.matches("(?s).*(salary|payroll|راتب|مرتب).*"))return "Salary";
            return "Other income";
        }
        if(s.matches("(?s).*(uber|careem|metro|fuel|petrol|gas station|transport|بنزين|مواصلات).*"))return "Transport";
        if(s.matches("(?s).*(amazon|noon|jumia|mall|fashion|clothes|zara|shopping).*"))return "Shopping";
        if(s.matches("(?s).*(restaurant|cafe|coffee|starbucks|mcdonald|kfc|talabat|breadfast|food|مطعم|كافيه).*"))return "Food & drinks";
        if(s.matches("(?s).*(netflix|spotify|youtube|subscription|apple.com/bill|google one).*"))return "Subscriptions";
        if(s.matches("(?s).*(electric|water bill|gas bill|internet|telecom|vodafone|orange|we internet|utility).*"))return "Bills & utilities";
        if(s.matches("(?s).*(pharmacy|hospital|clinic|doctor|صيدلية|مستشفى).*"))return "Health";
        return "Other";
    }
}
