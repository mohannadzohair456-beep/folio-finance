import com.folio.finance.TransactionParser;
/** Synthetic bank and wallet samples. They are not copied from real customer alerts. */
public class ParserTest {
  private static int n=0;
  static void ok(String title,String message,String dir,long amount,String currency) {
    TransactionParser.ParsedTransaction t=TransactionParser.parse(title,message);
    if(t==null||!t.direction.equals(dir)||t.amountMinor!=amount||!t.currency.equals(currency))
      throw new AssertionError(title+" | "+message+" => "+(t==null?"null":t.direction+" "+t.amountMinor+" "+t.currency));
    n++;
  }
  static void no(String title,String message){
    if(TransactionParser.parse(title,message)!=null)throw new AssertionError("expected reject: "+message);
    n++;
  }
  public static void main(String[] args) {
    ok("Bank","Your card was charged EGP 150.25 at Carrefour","expense",15025,"EGP");
    ok("Bank","Received 2000 EGP from Ahmed","income",200000,"EGP");
    ok("Bank","تم خصم مبلغ ٣٥٠ جنيه لدى كارفور","expense",35000,"EGP");
    ok("Bank","Refunded USD 12.99 from Amazon","income",1299,"USD");
    ok("Bank","Salary credited SAR 9,000","income",900000,"SAR");
    no("Bank","Your OTP is 123456 to confirm payment EGP 900");
    no("Bank","Your card payment was declined EGP 50");
    no("Bank","Your available balance only is EGP 5000");
    no("News","Company announced EGP 700 of funding");
    ok("Card notification","Your card was used for EGP 275.00 at Market","expense",27500,"EGP");
    ok("Card notification","Your debit card was used for 1,050 EGP at Supermarket","expense",105000,"EGP");
    ok("Transfer","Funds received SAR 1,200","income",120000,"SAR");
    ok("Bank","تم شراء منتجات بمبلغ ١٢٥٫٥٠ جنيه","expense",12550,"EGP");
    no("Bank","Your purchase for EGP 150.00 was not approved");

    // Synthetic Egyptian alerts. The purchase amount must win over the balance.
    ok("CIB synthetic","CIB Alert: EGP 5,000.00 available balance. Your card was charged EGP 50.00 at Starbucks.","expense",5000,"EGP");
    ok("CIB synthetic","CIB: Purchase of EGP 80.00 at TALABAT is pending. Available balance EGP 2,000.00","expense",8000,"EGP");
    ok("CIB synthetic","CIB: Your card was charged EGP 40.00 at COFFEE. Settlement pending. Balance EGP 900.00","expense",4000,"EGP");
    ok("NBE synthetic","NBE: Amount of EGP 99.00 was debited at TALABAT. Current balance EGP 1,500.00","expense",9900,"EGP");
    ok("Banque Misr synthetic","Banque Misr: تم خصم مبلغ 430.75 جنيه من بطاقتكم لدى سبينس. الرصيد المتاح 12,000.00 جنيه","expense",43075,"EGP");
    ok("Vodafone Cash synthetic","Vodafone Cash: You sent EGP 150.00 to 0100****321. Your balance is EGP 60.00.","expense",15000,"EGP");
    ok("InstaPay synthetic","InstaPay: You received EGP 2,500.00 from Mohamed Ali. Available balance EGP 3,100.00.","income",250000,"EGP");
    ok("NBE synthetic","NBE: Salary of EGP 18,500.00 has been credited. Available balance EGP 20,100.55","income",1850000,"EGP");
    no("CIB synthetic","CIB: Your OTP is 482193 to confirm payment of EGP 900.00. Do not share this code.");
    no("NBE synthetic","NBE: Pre-authorization hold of EGP 500.00 at HOTEL. This is not a completed charge.");
    no("NBE synthetic","NBE: Payment authorization of EGP 220.00 at AMAZON. Authorization only.");
    no("Banque Misr synthetic","Banque Misr: رصيدك الحالي 8,888.00 جنيه");
    no("CIB synthetic","CIB: Transaction declined EGP 75.00 at STORE. Insufficient funds.");
    no("InstaPay synthetic","InstaPay: Transfer failed for EGP 300.00. No amount was completed.");

    // Synthetic Saudi alerts.
    ok("Al Rajhi synthetic","Al Rajhi: Purchase SAR 86.50 at TAMIMI MARKETS via mada. Available balance SAR 4,210.00","expense",8650,"SAR");
    ok("Al Rajhi synthetic","مصرف الراجحي: خصم 120.00 ريال لدى بنده. الرصيد 3000 ريال","expense",12000,"SAR");
    ok("STC Pay synthetic","STC Pay: You paid SAR 45.00 at Jarir. Balance SAR 900.00","expense",4500,"SAR");
    ok("SNB synthetic","SNB: SAR 2,000.00 has been deposited to your account. Available balance SAR 2,400.00","income",200000,"SAR");
    ok("Alinma synthetic","Alinma: Refunded SAR 60.00 from JARIR. Balance SAR 500.00","income",6000,"SAR");
    no("STC Pay synthetic","STC Pay: Your verification code is 559911 for payment SAR 30.00");
    no("Al Rajhi synthetic","Al Rajhi: Transaction declined SAR 200.00 at STORE.");
    no("STC Pay synthetic","STC Pay: Payment failed for SAR 30.00. The payment was not completed.");
    no("SNB synthetic","SNB: Available balance SAR 9,999.00");
    no("Al Rajhi synthetic","Al Rajhi: Authorization hold SAR 200.00 at HOTEL.");

    System.out.println("PASS "+n+" parser cases");
  }
}
