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

    // The transaction is 5 and the stated balance is 5,010. Never book the balance.
    hi("EN alert","You paid 5 EGP. Available balance EGP 5,010.00","expense",500,"EGP",501000L);
    hi("EN short","paid 5, balance 5,010 EGP","expense",500,"EGP",501000L);
    hi("EN words","You paid 5, your balance is 5,010 EGP","expense",500,"EGP",501000L);
    hi("EN avl","Debited EGP 5.00. Avl Bal EGP 5,010.00","expense",500,"EGP",501000L);
    hi("EN left","You spent EGP 5.00. Remaining balance EGP 5,010","expense",500,"EGP",501000L);
    hi("EN first","Available balance EGP 5,010.00. You paid EGP 5.00 at Kiosk","expense",500,"EGP",501000L);
    hi("AR debit","تم خصم 5 جنيه. رصيدك 5,010 جنيه","expense",500,"EGP",501000L);
    hi("AR indic","تم خصم مبلغ ٥ جنيه. الرصيد المتاح ٥٬٠١٠ جنيه","expense",500,"EGP",501000L);
    hi("AR comma","دفعت 5، رصيدك 5,010 جنيه","expense",500,"EGP",501000L);
    hi("AR remain","تم دفع مبلغ 5 ج.م والرصيد المتبقي 5010 ج.م","expense",500,"EGP",501000L);
    hi("AR avail","تم سحب 5 جنيه. المتاح 5,010 جنيه","expense",500,"EGP",501000L);
    hi("AR deposit","تم إيداع 5 جنيه. الرصيد 5,010 جنيه","income",500,"EGP",501000L);
    hi("AR add","تم اضافة 5 جنيه. رصيدك الحالي 5,010 جنيه","income",500,"EGP",501000L);

    // Clearly labeled synthetic Egyptian bank and wallet alerts. Not copied from a customer.
    hi("CIB synthetic 5","CIB Alert: تم خصم 5.00 جنيه من بطاقتكم المنتهية بـ 4321 لدى TALABAT. الرصيد المتاح 5,010.00 جنيه","expense",500,"EGP",501000L);
    hi("CIB synthetic EN","CIB: Purchase of EGP 5.00 at CARREFOUR. Available balance EGP 5,010.00","expense",500,"EGP",501000L);
    hi("NBE synthetic 5","البنك الأهلي المصري: تم خصم مبلغ 5.00 جم من حسابكم. رصيدك الحالي 5010.00 جم","expense",500,"EGP",501000L);
    hi("NBE synthetic EN","NBE: Amount of EGP 5.00 was debited. Current balance EGP 5,010.00","expense",500,"EGP",501000L);
    hi("Banque Misr synthetic 5","بنك مصر: خصم 5.00 ج.م لدى فوري. المتبقي 5,010.00 ج.م","expense",500,"EGP",501000L);
    hi("QNB synthetic","QNB ALAHLI: Purchase of EGP 5.00 at CARREFOUR. Avl Bal EGP 5,010.00","expense",500,"EGP",501000L);
    hi("InstaPay synthetic out","InstaPay: تم تحويل 5 جنيه إلى 0100****123. الرصيد المتبقي 5,010 جنيه","expense",500,"EGP",501000L);
    hi("InstaPay synthetic in","InstaPay: You received EGP 5.00 from Nour. Available balance EGP 5,010.00","income",500,"EGP",501000L);
    hi("Vodafone Cash synthetic 5","Vodafone Cash: تم سحب 5 جنيه. رصيدك 5,010 جنيه","expense",500,"EGP",501000L);
    hi("Vodafone Cash EN","Vodafone Cash: You sent EGP 5.00 to 0100****123. Your balance is EGP 5,010.00","expense",500,"EGP",501000L);
    hi("Telda synthetic","Telda: You spent EGP 5.00 at COFFEE. Remaining balance EGP 5,010.00","expense",500,"EGP",501000L);
    hi("LE currency","You paid LE 5.00. Balance L.E. 5,010.00","expense",500,"EGP",501000L);

    lo("two debits","Debited EGP 12.00 and debited EGP 30.00","expense");
    no("balance only 5010","Your available balance is EGP 5,010.00");
    no("arabic balance only","رصيدك الحالي 5,010 جنيه");
    no("remaining only","Remaining balance EGP 5,010");

    System.out.println("PASS "+n+" parser cases");
  }
  static void hi(String title,String message,String dir,long amount,String currency,Long balance){
    TransactionParser.ParsedTransaction t=TransactionParser.parse(title,message);
    if(t==null||!t.direction.equals(dir)||t.amountMinor!=amount||!t.currency.equals(currency))
      throw new AssertionError(title+" | "+message+" => "+(t==null?"null":t.direction+" "+t.amountMinor+" "+t.currency+" "+t.confidence));
    if(!"high".equals(t.confidence)||t.ambiguous)
      throw new AssertionError(title+" expected high confidence, got "+t.confidence+" ambiguous="+t.ambiguous);
    if(balance!=null&&(t.statedBalanceMinor==null||t.statedBalanceMinor.longValue()!=balance||!"EGP".equals(t.statedBalanceCurrency)))
      throw new AssertionError(title+" balance "+t.statedBalanceMinor+" "+t.statedBalanceCurrency);
    n++;
  }
  static void lo(String title,String message,String dir){
    TransactionParser.ParsedTransaction t=TransactionParser.parse(title,message);
    if(t==null||!t.direction.equals(dir)||"high".equals(t.confidence)||!t.ambiguous)
      throw new AssertionError(title+" expected a low-confidence "+dir+" parse, got "+(t==null?"null":t.direction+" "+t.amountMinor+" "+t.confidence+" ambiguous="+t.ambiguous));
    n++;
  }
}
