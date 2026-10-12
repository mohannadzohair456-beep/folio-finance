import com.folio.finance.IngestionDedup;
import java.util.ArrayList;
import java.util.List;

/** Covers cross-app reposts without collapsing a later identical purchase. */
public class DedupTest {
  private static int n=0;
  static void check(boolean cond, String message){ if(!cond) throw new AssertionError(message); n++; }
  public static void main(String[] args) {
    List<IngestionDedup.Seen> memory=new ArrayList<>();
    long t0=1_700_000_000_000L;
    String sms="CIB: Your card was charged EGP 50.00 at Starbucks. Ref 10001. Balance EGP 900.00";
    IngestionDedup.Verdict first=IngestionDedup.evaluate(memory,t0,5000,"EGP","expense","Starbucks",sms);
    check(!first.duplicate,"first alert is stored");
    check(first.id.startsWith("fp-"),"stable fingerprint id");
    memory=first.retained;

    IngestionDedup.Verdict otherApp=IngestionDedup.evaluate(memory,t0+8_000,5000,"EGP","expense","Starbucks",sms);
    check(otherApp.duplicate,"same SMS from a second app is one transaction");
    check(otherApp.id.equals(first.id),"duplicate keeps the original id");

    String other="NBE: Debited EGP 20.00 at Metro. Ref 555000. Balance EGP 880.00";
    IngestionDedup.Verdict between=IngestionDedup.evaluate(memory,t0+20_000,2000,"EGP","expense","Metro",other);
    check(!between.duplicate,"a different purchase in between is kept");
    memory=between.retained;

    IngestionDedup.Verdict replay=IngestionDedup.evaluate(memory,t0+3*60*60*1000,5000,"EGP","expense","Starbucks",sms);
    check(replay.duplicate,"identical text reposted hours later is still one event inside 24h");

    String later="CIB: Your card was charged EGP 50.00 at Starbucks. Ref 10088. Balance EGP 850.00";
    IngestionDedup.Verdict secondPurchase=IngestionDedup.evaluate(memory,t0+2*60*60*1000,5000,"EGP","expense","Starbucks",later);
    check(!secondPurchase.duplicate,"same amount and merchant two hours later with a new reference is kept");
    memory=secondPurchase.retained;

    String near="Bank app: charged EGP 50.00 at STARBUCKS CAIRO. Ref 10001.";
    IngestionDedup.Verdict nearDup=IngestionDedup.evaluate(memory,t0+30_000,5000,"EGP","expense","Starbucks Cairo",near);
    check(nearDup.duplicate,"rephrased alert with the same reference inside 90s is one event");

    String distinct="Bank app: charged EGP 50.00 at Starbucks. Ref 777777.";
    IngestionDedup.Verdict distinctRef=IngestionDedup.evaluate(memory,t0+40_000,5000,"EGP","expense","Starbucks",distinct);
    check(!distinctRef.duplicate,"a different reference inside 90s is a separate purchase");

    IngestionDedup.Verdict taxi=IngestionDedup.evaluate(memory,t0+45_000,5000,"EGP","expense","Careem","You paid EGP 50.00 to Careem.");
    check(!taxi.duplicate,"same amount at a different merchant inside 90s is kept");

    IngestionDedup.Verdict expired=IngestionDedup.evaluate(new ArrayList<>(),t0+25L*60*60*1000,5000,"EGP","expense","Starbucks",sms);
    check(!expired.duplicate,"identical text is accepted again after the 24h memory expires");

    check(IngestionDedup.merchantsCompatible("Card payment","Starbucks"),"generic parser label matches a named merchant");
    check(!IngestionDedup.merchantsCompatible("Careem","Starbucks"),"unrelated merchants stay distinct");
    System.out.println("PASS "+n+" dedup cases");
  }
}
