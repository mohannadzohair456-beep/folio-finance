package com.folio.finance;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import org.json.JSONObject;
import java.util.UUID;

public final class FinanceNotificationListener extends NotificationListenerService {
    @Override public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (!NativeStore.isCaptureEnabled(this)) return;
            String source = sbn.getPackageName();
            if (source.equals(getPackageName()) || !NativeStore.allowed(this, source)) return;
            Notification notification = sbn.getNotification();
            if ((notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle extras = notification.extras; if (extras == null) return;
            String title = extras.getCharSequence(Notification.EXTRA_TITLE, "").toString();
            CharSequence expanded = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
            String body = expanded != null ? expanded.toString() : extras.getCharSequence(Notification.EXTRA_TEXT, "").toString();
            if (body.isBlank()) return;
            TransactionParser.ParsedTransaction tx = TransactionParser.parse(title, body);
            if (tx == null) return;
            JSONObject item = new JSONObject();
            item.put("id", UUID.randomUUID().toString());
            item.put("amountMinor", tx.amountMinor);
            item.put("currency", tx.currency);
            item.put("direction", tx.direction);
            item.put("merchant", tx.merchant);
            item.put("category", tx.category);
            item.put("source", "notification");
            item.put("sourcePackage", source);
            item.put("occurredAt", sbn.getPostTime());
            item.put("review", true);
            NativeStore.enqueue(this, item, source+"|"+title+"|"+body);
        } catch (Exception ignored) { }
    }
}
