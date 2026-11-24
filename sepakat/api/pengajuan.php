<?php
// POST {id_jadwal, tanggal, jam, ruang, alasan} -> Dosen mengajukan perubahan (FR-03, FR-04, FR-07, FR-08)
require "koneksi.php";
$user = wajib_login("dosen");
$in = input();
$id_jadwal = (int) ($in["id_jadwal"] ?? 0);
$tanggal   = $in["tanggal"] ?? "";
$jam       = array_search($in["jam"] ?? "", SLOT);     // "13.00-15.30" -> "13:00:00"
$alasan    = trim($in["alasan"] ?? "");
$ruang     = satu($db, "SELECT id_ruang FROM ruang WHERE nama_ruang = ?", "s", $in["ruang"] ?? "");

$j = satu($db, "SELECT * FROM jadwal_kuliah WHERE id_jadwal = ? AND id_dosen = ?", "ii", $id_jadwal, $user["id_dosen"]);
if (!$j) gagal("Mata kuliah tidak ditemukan atau bukan milik Anda.");
if (!$jam || !$ruang) gagal("Pilih ruang dan slot waktu yang kosong terlebih dahulu.");
if ($alasan === "") gagal("Alasan perubahan wajib diisi.");
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) gagal("Tanggal kuliah pengganti tidak valid.");

// FR-07: harus diajukan sebelum H-7
$selisih = (int) ((strtotime($tanggal) - strtotime(date("Y-m-d"))) / 86400);
if ($selisih <= 7) gagal("Pengajuan ditolak: harus diajukan sebelum H-7 agar mahasiswa sempat voting.");

// FR-08: maksimal 3x pengajuan per mata kuliah
$ke = (int) satu($db, "SELECT COUNT(*) n FROM pengajuan_perubahan WHERE id_jadwal = ?", "i", $id_jadwal)["n"] + 1;
if ($ke > 3) gagal("Pengajuan ditolak: sudah mencapai batas 3x pengajuan ulang.");

// FR-04: ruang & jam tidak boleh bentrok dengan kuliah lain / usulan lain yang masih aktif
$hari = hari_dari_tanggal($tanggal);
if (satu($db, "SELECT 1 FROM jadwal_kuliah WHERE hari = ? AND jam = ? AND id_ruang = ?", "ssi", $hari, $jam, $ruang["id_ruang"]))
    gagal("Ruang dan jam tersebut sudah terisi kuliah lain.");
$usulan = "$tanggal $jam";
if (satu($db, "SELECT 1 FROM pengajuan_perubahan WHERE jadwal_usulan = ? AND id_ruang_usulan = ? AND status IN ('menunggu','voting','disetujui')", "si", $usulan, $ruang["id_ruang"]))
    gagal("Ruang dan jam tersebut sudah dipakai usulan lain.");

$batas = date("Y-m-d", strtotime("$tanggal -7 day"));
jalankan($db, "INSERT INTO pengajuan_perubahan (id_jadwal, id_dosen, jadwal_usulan, id_ruang_usulan, alasan, tanggal_pengajuan, batas_waktu, status, jumlah_pengajuan)
               VALUES (?, ?, ?, ?, ?, CURDATE(), ?, 'menunggu', ?)", "iisissi",
          $id_jadwal, $user["id_dosen"], $usulan, $ruang["id_ruang"], $alasan, $batas, $ke);
$id = $db->insert_id;

// beri tahu Fakultas/Admin ada pengajuan baru
foreach (semua($db, "SELECT id_pengguna FROM fakultas_admin") as $a) {
    jalankan($db, "INSERT INTO notifikasi (id_pengguna, isi) VALUES (?, ?)", "is", $a["id_pengguna"],
             "Pengajuan baru dari " . $user["nama"] . ": " . $j["mata_kuliah"] . " " . $j["kelas"] . ".");
}
kirim(["id" => sprintf("PJ-%03d", $id)]);
