<?php
// POST {id, pilihan: setuju|tidak_setuju, alasan, alternatif} -> Mahasiswa voting / keberatan (FR-05, FR-09, FR-10)
require "koneksi.php";
$user = wajib_login("mahasiswa");
$in = input();
$id         = (int) ($in["id"] ?? 0);
$pilihan    = ($in["pilihan"] ?? "") === "setuju" ? "setuju" : "tidak_setuju";
$alasan     = trim($in["alasan"] ?? "");
$alternatif = trim($in["alternatif"] ?? "");

$p = satu($db, "SELECT p.status, p.batas_waktu FROM pengajuan_perubahan p JOIN jadwal_kuliah j ON j.id_jadwal = p.id_jadwal
                WHERE p.id_pengajuan = ? AND j.kelas = ?", "is", $id, $user["kelas"]);
if (!$p) gagal("Usulan tidak ditemukan untuk kelas Anda.");
if ($p["status"] !== "voting" || date("Y-m-d") > $p["batas_waktu"]) gagal("Voting sudah ditutup (lewat batas H-7).");
if ($pilihan === "tidak_setuju" && $alasan === "") gagal("Alasan tidak setuju wajib diisi.");
if (satu($db, "SELECT 1 FROM voting WHERE id_pengajuan = ? AND id_mahasiswa = ?", "ii", $id, $user["id_mahasiswa"]))
    gagal("Anda sudah memberikan suara untuk usulan ini.");

try {
    jalankan($db, "INSERT INTO voting (id_pengajuan, id_mahasiswa, pilihan, alasan_menolak, opsi_alternatif) VALUES (?, ?, ?, ?, ?)",
             "iisss", $id, $user["id_mahasiswa"], $pilihan, $alasan ?: null, $alternatif ?: null);
} catch (mysqli_sql_exception $e) {
    gagal($e->getCode() == 1644 ? "Voting sudah ditutup (lewat batas H-7)." : "Suara gagal disimpan.");
}
kirim([]);
