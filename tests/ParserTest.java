import com.folio.finance.TransactionParser;
public class ParserTest {
  private static int n=0;
  static void ok(String title,String message,String dir,long amount,String currency) {
    TransactionParser.ParsedTransaction t=TransactionParser.parse(title,message);
    if(t==null||!t.direction.equals(dir)||t.amountMinor!=amount||!t.currency.equals(currency))throw new AssertionError(message);
    n++;
  }
  static void no(String title,String message){if(TransactionParser.parse(title,message)!=null)throw new AssertionError(message);n++;}
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
    System.out.println("PASS "+n+" parser cases");
  }
}