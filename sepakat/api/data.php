<?php
// GET -> semua data yang dibutuhkan halaman sesuai peran yang login
require "koneksi.php";
$user = wajib_login();

// Tutup otomatis voting yang sudah lewat H-7 (FR-06, FR-07)
tutup_voting_kedaluwarsa($db);

// Mata kuliah (jadwal_kuliah)
$mk = [];
foreach (semua($db, "SELECT j.*, r.nama_ruang, (SELECT COUNT(*) FROM mahasiswa m WHERE m.kelas = j.kelas) AS peserta
                     FROM jadwal_kuliah j JOIN ruang r ON r.id_ruang = j.id_ruang ORDER BY j.id_jadwal") as $j) {
    $mk[] = ["kode" => (int) $j["id_jadwal"], "nama" => $j["mata_kuliah"], "kelas" => $j["kelas"], "hari" => $j["hari"],
             "jam" => rentang_asli($j["jam"], $j["jam_selesai"]), "ruang" => $j["nama_ruang"], "peserta" => (int) $j["peserta"],
             "milikSaya" => ($user["peran"] === "dosen" && (int) $j["id_dosen"] === $user["id_dosen"])];
}

// Ruang & slot terisi oleh kuliah lain (FR-03, FR-04)
$ruang = array_column(semua($db, "SELECT nama_ruang FROM ruang ORDER BY id_ruang"), "nama_ruang");
$terisi = [];
foreach (semua($db, "SELECT j.hari, j.jam, j.mata_kuliah, j.kelas, r.nama_ruang FROM jadwal_kuliah j JOIN ruang r ON r.id_ruang = j.id_ruang") as $t) {
    $terisi[$t["hari"]][$t["nama_ruang"]][rentang($t["jam"])] = $t["mata_kuliah"] . " " . $t["kelas"];
}

// Pengajuan + hasil voting
$where = ""; $types = ""; $val = [];
if ($user["peran"] === "dosen")     { $where = "WHERE p.id_dosen = ?"; $types = "i"; $val = [$user["id_dosen"]]; }
if ($user["peran"] === "mahasiswa") { $where = "WHERE j.kelas = ? AND p.status <> 'menunggu'"; $types = "s"; $val = [$user["kelas"]]; }
$rows = semua($db, "SELECT p.*, j.mata_kuliah, j.kelas, j.hari, j.jam, j.jam_selesai, ru.nama_ruang AS ruang_usulan,
                           r.jumlah_setuju, r.jumlah_tidak_setuju, r.jumlah_mahasiswa
                    FROM pengajuan_perubahan p
                    JOIN jadwal_kuliah j ON j.id_jadwal = p.id_jadwal
                    LEFT JOIN ruang ru ON ru.id_ruang = p.id_ruang_usulan
                    JOIN rekap_voting r ON r.id_pengajuan = p.id_pengajuan
                    $where ORDER BY p.id_pengajuan DESC", $types, ...$val);
$pengajuan = [];
foreach ($rows as $p) {
    $id = (int) $p["id_pengajuan"];
    $keb = [];
    foreach (semua($db, "SELECT u.nama, v.alasan_menolak, v.opsi_alternatif FROM voting v
                         JOIN mahasiswa m ON m.id_mahasiswa = v.id_mahasiswa JOIN pengguna u ON u.id_pengguna = m.id_pengguna
                         WHERE v.id_pengajuan = ? AND v.pilihan = 'tidak_setuju'", "i", $id) as $k) {
        $keb[] = ["nama" => $k["nama"], "isi" => $k["alasan_menolak"] . ($k["opsi_alternatif"] ? " (alternatif: " . $k["opsi_alternatif"] . ")" : "")];
    }
    $mine = null; $alasanSaya = null;
    if ($user["peran"] === "mahasiswa") {
        $v = satu($db, "SELECT pilihan, alasan_menolak FROM voting WHERE id_pengajuan = ? AND id_mahasiswa = ?", "ii", $id, $user["id_mahasiswa"]);
        if ($v) { $mine = $v["pilihan"] === "setuju" ? "setuju" : "tolak"; $alasanSaya = $v["alasan_menolak"]; }
    }
    $tgl = substr($p["jadwal_usulan"], 0, 10);
    $pengajuan[] = [
        "id" => sprintf("PJ-%03d", $id), "idn" => $id, "kode" => (int) $p["id_jadwal"], "kelas" => $p["kelas"],
        "lama" => $p["hari"] . " " . rentang_asli($p["jam"], $p["jam_selesai"]),
        "baru" => hari_dari_tanggal($tgl) . " " . rentang(substr($p["jadwal_usulan"], 11, 8)),
        "ruang" => $p["ruang_usulan"] ?? "-", "tgl" => $tgl, "alasan" => $p["alasan"], "status" => $p["status"],
        "setuju" => (int) $p["jumlah_setuju"], "tolak" => (int) $p["jumlah_tidak_setuju"], "pemilih" => (int) $p["jumlah_mahasiswa"],
        "ke" => (int) $p["jumlah_pengajuan"], "keberatan" => $keb, "myVote" => $mine, "alasanSaya" => $alasanSaya,
    ];
}

// Notifikasi milik pengguna yang login (FR-01)
$notif = semua($db, "SELECT id_notifikasi AS id, isi, waktu_kirim AS waktu, status_baca AS dibaca
                     FROM notifikasi WHERE id_pengguna = ? ORDER BY id_notifikasi DESC LIMIT 10", "i", $user["id_pengguna"]);
foreach ($notif as &$n) { $n["id"] = (int) $n["id"]; $n["dibaca"] = (bool) $n["dibaca"]; }

kirim(["user" => $user, "hariIni" => date("Y-m-d"), "mk" => $mk, "ruang" => $ruang, "terisi" => (object) $terisi,
       "pengajuan" => $pengajuan, "notif" => $notif]);
