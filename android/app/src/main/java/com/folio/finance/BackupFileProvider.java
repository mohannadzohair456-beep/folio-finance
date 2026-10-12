package com.folio.finance;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

/** Serves one backup file from app cache for the share sheet. Nothing is uploaded. */
public final class BackupFileProvider extends ContentProvider {
    static final String AUTH = "com.folio.finance.app.backup";

    @Override public boolean onCreate() { return true; }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) { return null; }

    @Override public String getType(Uri uri) {
        String name = uri == null ? "" : String.valueOf(uri.getLastPathSegment());
        return name.endsWith(".json") ? "application/json" : "text/csv";
    }

    @Override public Uri insert(Uri uri, ContentValues values) { return null; }

    @Override public int delete(Uri uri, String selection, String[] args) { return 0; }

    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { return 0; }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (uri == null || mode == null || !mode.startsWith("r") || getContext() == null) throw new FileNotFoundException();
        String name = uri.getLastPathSegment();
        if (name == null || !name.matches("[A-Za-z0-9._-]{1,80}")) throw new FileNotFoundException();
        File dir = new File(getContext().getCacheDir(), "backup");
        File file = new File(dir, name);
        try {
            File canonical = file.getCanonicalFile();
            File parent = dir.getCanonicalFile();
            if (canonical.getParentFile() == null || !canonical.getParentFile().equals(parent) || !canonical.isFile()) {
                throw new FileNotFoundException();
            }
            return ParcelFileDescriptor.open(canonical, ParcelFileDescriptor.MODE_READ_ONLY);
        } catch (FileNotFoundException e) {
            throw e;
        } catch (Exception e) {
            throw new FileNotFoundException();
        }
    }
}
