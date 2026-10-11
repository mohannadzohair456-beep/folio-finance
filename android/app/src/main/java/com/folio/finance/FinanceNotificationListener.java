package com.folio.finance;
import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import org.json.JSONObject;
import java.util.UUID;
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
            if(body.isBlank()) {
                CharSequence[] lines=extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
                if(lines!=null&&lines.length>0&&lines[lines.length-1]!=null)body=lines[lines.length-1].toString();
            }
            if(body.isBlank()){NativeStore.note(this,"empty");return;}
            TransactionParser.ParsedTransaction tx=TransactionParser.parse(title,body);
            if(tx==null){NativeStore.note(this,"unrecognized");return;}
            JSONObject item=new JSONObject();
            item.put("id",UUID.randomUUID().toString());
            item.put("amountMinor",tx.amountMinor);
            item.put("currency",tx.currency);
            item.put("direction",tx.direction);
            item.put("merchant",tx.merchant);
            item.put("category",tx.category);
            item.put("source","notification");
            item.put("sourcePackage",source);
            item.put("occurredAt",sbn.getPostTime());
            item.put("review",true);
            NativeStore.enqueue(this,item,source+"|"+title+"|"+body);
            NativeStore.note(this,"recognized");
        }catch(Exception ignored){}
    }
}
