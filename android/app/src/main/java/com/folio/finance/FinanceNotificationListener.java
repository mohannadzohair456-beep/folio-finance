package com.folio.finance;
import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import org.json.JSONObject;
/** Processes new notifications only after opt-in. Never saves message bodies. */
public final class FinanceNotificationListener extends NotificationListenerService {
    @Override public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if(!NativeStore.isCaptureEnabled(this))return;
            String source=sbn.getPackageName();
            if(source==null||source.equals(getPackageName()))return;
            NativeStore.observe(this,source);
            if(!NativeStore.allowed(this,source))return;
            Notification notification=sbn.getNotification();
            if(notification==null||(notification.flags & Notification.FLAG_GROUP_SUMMARY)!=0)return;
            Bundle extras=notification.extras;
            if(extras==null)return;
            String title=String.valueOf(extras.getCharSequence(Notification.EXTRA_TITLE,""));
            CharSequence expanded=extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
            String body=expanded!=null?expanded.toString():String.valueOf(extras.getCharSequence(Notification.EXTRA_TEXT,""));
            if(body.trim().isEmpty()) {
                CharSequence[] lines=extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
                if(lines!=null&&lines.length>0&&lines[lines.length-1]!=null)body=lines[lines.length-1].toString();
            }
            if(body.trim().isEmpty()){NativeStore.note(this,"empty");return;}
            TransactionParser.ParsedTransaction tx=TransactionParser.parse(title,body);
            if(tx==null){NativeStore.note(this,"unrecognized");return;}
            JSONObject item=new JSONObject();
            item.put("amountMinor",tx.amountMinor);
            item.put("currency",tx.currency);
            item.put("direction",tx.direction);
            item.put("merchant",tx.merchant);
            item.put("category",tx.category);
            item.put("source","notification");
            item.put("sourcePackage",source);
            item.put("occurredAt",sbn.getPostTime());
            item.put("confidence", tx.confidence);
            item.put("ambiguous", tx.ambiguous);
            // The page decides confirmed versus review. A missing confidence stays in review.
            item.put("review", !"high".equals(tx.confidence) || tx.ambiguous);
            if (tx.statedBalanceMinor != null) {
                item.put("statedBalanceMinor", tx.statedBalanceMinor.longValue());
                item.put("statedBalanceCurrency", tx.statedBalanceCurrency == null ? tx.currency : tx.statedBalanceCurrency);
            }
            String content=TransactionParser.normalize((title==null?"":title)+"\n"+body);
            if(!NativeStore.enqueue(this,item,content)){NativeStore.note(this,"duplicate");return;}
            NativeStore.note(this,"recognized");
        }catch(Exception ignored){}
    }
}
