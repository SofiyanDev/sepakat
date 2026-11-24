<?php
// POST {id, aksi: buka|tolak|tutup} -> Fakultas/Admin (FR-06)
require "koneksi.php";
$user = wajib_login("fakultas_admin");
$in = input();
$id   = (int) ($in["id"] ?? 0);
$aksi = $in["aksi"] ?? "";
$p = satu($db, "SELECT status FROM pengajuan_perubahan WHERE id_pengajuan = ?", "i", $id);
if (!$p) gagal("Pengajuan tidak ditemukan.");

if ($aksi === "buka" && $p["status"] === "menunggu") {
    // notifikasi ke seluruh mahasiswa kelas (lokal: trigger trg_notif_voting, online: PHP)
    ubah_status($db, $id, "voting", $user["id_admin"]);
} elseif ($aksi === "tolak" && $p["status"] === "menunggu") {
    ubah_status($db, $id, "ditolak", $user["id_admin"]);
} elseif ($aksi === "tutup" && $p["status"] === "voting") {
    // simulasi H-7: tutup sekarang, hasil mengikuti rekap voting (>50% = disetujui)
    ubah_status($db, $id, hasil_rekap($db, $id));
} else {
    gagal("Aksi tidak bisa dilakukan pada status ini.");
}
$baru = satu($db, "SELECT status FROM pengajuan_perubahan WHERE id_pengajuan = ?", "i", $id)["status"];
kirim(["status" => $baru]);
