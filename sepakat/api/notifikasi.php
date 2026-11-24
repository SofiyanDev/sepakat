<?php
// GET  -> notifikasi yang belum dibaca (dipakai untuk pop-up di HP, dicek berkala)
// POST {ids:[...]} -> tandai sudah dibaca
require "koneksi.php";
$user = wajib_login();
if ($_SERVER["REQUEST_METHOD"] === "POST") {
    foreach ((input()["ids"] ?? []) as $nid) {
        jalankan($db, "UPDATE notifikasi SET status_baca = TRUE WHERE id_notifikasi = ? AND id_pengguna = ?", "ii", (int) $nid, $user["id_pengguna"]);
    }
    kirim([]);
}
$baru = semua($db, "SELECT id_notifikasi AS id, isi FROM notifikasi WHERE id_pengguna = ? AND status_baca = FALSE ORDER BY id_notifikasi", "i", $user["id_pengguna"]);
kirim(["baru" => $baru]);
