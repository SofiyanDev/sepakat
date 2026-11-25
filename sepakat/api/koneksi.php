<?php
// ===== Koneksi database SEPAKAT =====
// Lokal (XAMPP): pakai nilai default di bawah (user root, password kosong).
// Online (Vercel): isi Environment Variables DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME
//                  di Vercel -> otomatis masuk MODE_CLOUD (TiDB Cloud, koneksi SSL).
$DB_HOST = getenv("DB_HOST") ?: "localhost";
$DB_PORT = (int) (getenv("DB_PORT") ?: 3306);
$DB_USER = getenv("DB_USER") ?: "root";
$DB_PASS = getenv("DB_PASS") !== false ? getenv("DB_PASS") : "";
$DB_NAME = getenv("DB_NAME") ?: "sepakat";
define("MODE_CLOUD", (bool) getenv("DB_HOST"));

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
header("Content-Type: application/json; charset=utf-8");
date_default_timezone_set("Asia/Jakarta");

try {
    $db = mysqli_init();
    $flag = 0;
    if (MODE_CLOUD && getenv("DB_SSL") !== "0") {
        // TiDB Cloud wajib SSL. Cari sertifikat CA bawaan server.
        $ca = getenv("DB_SSL_CA") ?: null;
        foreach (["/etc/pki/tls/certs/ca-bundle.crt", "/etc/ssl/certs/ca-certificates.crt", "/etc/ssl/cert.pem"] as $c) {
            if (!$ca && is_readable($c)) $ca = $c;
        }
        $db->ssl_set(null, null, $ca, null, null);
        $flag = MYSQLI_CLIENT_SSL | ($ca ? 0 : MYSQLI_CLIENT_SSL_DONT_VERIFY_SERVER_CERT);
    }
    $db->real_connect($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME, $DB_PORT, null, $flag);
    $db->set_charset("utf8mb4");
    $db->query("SET time_zone = '+07:00'");
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["ok" => false, "pesan" => MODE_CLOUD
        ? "Gagal konek ke database online. Cek Environment Variables DB_* di Vercel."
        : "Gagal konek ke database. Cek XAMPP MySQL sudah Start dan database 'sepakat' sudah di-import."]);
    exit;
}

// ---------- sesi login ----------
// Di Vercel tiap request bisa jalan di server berbeda, jadi sesi disimpan di tabel `sesi`
// (kalau pakai file biasa, user bakal sering ke-logout sendiri).
class SesiDatabase implements SessionHandlerInterface {
    public function __construct(private mysqli $db) {}
    public function open($path, $name): bool { return true; }
    public function close(): bool { return true; }
    public function read($id): string|false {
        $st = $this->db->prepare("SELECT data FROM sesi WHERE id = ?");
        $st->bind_param("s", $id); $st->execute();
        $r = $st->get_result()->fetch_assoc();
        return $r ? $r["data"] : "";
    }
    public function write($id, $data): bool {
        $t = time();
        $st = $this->db->prepare("REPLACE INTO sesi (id, data, waktu) VALUES (?, ?, ?)");
        $st->bind_param("ssi", $id, $data, $t);
        return $st->execute();
    }
    public function destroy($id): bool {
        $st = $this->db->prepare("DELETE FROM sesi WHERE id = ?");
        $st->bind_param("s", $id);
        return $st->execute();
    }
    public function gc($max): int|false {
        $batas = time() - $max;
        $st = $this->db->prepare("DELETE FROM sesi WHERE waktu < ?");
        $st->bind_param("i", $batas); $st->execute();
        return $st->affected_rows;
    }
}
if (MODE_CLOUD) {
    session_set_save_handler(new SesiDatabase($db), true);
    session_set_cookie_params(["lifetime" => 0, "path" => "/", "secure" => true, "httponly" => true, "samesite" => "Lax"]);
    ini_set("session.gc_maxlifetime", "86400");
}
session_start();

// ---------- fungsi bantu ----------
function kirim($data) { echo json_encode(["ok" => true] + $data); exit; }
function gagal($pesan, $kode = 400) { http_response_code($kode); echo json_encode(["ok" => false, "pesan" => $pesan]); exit; }
function input() { return json_decode(file_get_contents("php://input"), true) ?: []; }
function wajib_login($peran = null) {
    if (empty($_SESSION["user"])) gagal("Silakan login dulu.", 401);
    if ($peran && $_SESSION["user"]["peran"] !== $peran) gagal("Akses ditolak untuk peran ini.", 403);
    return $_SESSION["user"];
}
function satu($db, $sql, $types = "", ...$val) {
    $st = $db->prepare($sql);
    if ($types) $st->bind_param($types, ...$val);
    $st->execute();
    $r = $st->get_result();
    return $r ? $r->fetch_assoc() : null;
}
function semua($db, $sql, $types = "", ...$val) {
    $st = $db->prepare($sql);
    if ($types) $st->bind_param($types, ...$val);
    $st->execute();
    return $st->get_result()->fetch_all(MYSQLI_ASSOC);
}
function jalankan($db, $sql, $types = "", ...$val) {
    $st = $db->prepare($sql);
    if ($types) $st->bind_param($types, ...$val);
    $st->execute();
    return $st;
}
// slot jam kuliah: jam mulai -> rentang tampilan
const SLOT = ["07:30:00" => "07.30-10.00", "10:00:00" => "10.00-12.30", "12:30:00" => "12.30-15.00", "15:00:00" => "15.00-17.30"];
const HARI = [1 => "Senin", 2 => "Selasa", 3 => "Rabu", 4 => "Kamis", 5 => "Jumat", 6 => "Sabtu", 7 => "Minggu"];
function rentang($jam) { return SLOT[$jam] ?? substr($jam, 0, 5); }
// jam asli kuliah, misal "07.30-09.10" (kalau jam_selesai kosong pakai rentang slot)
function rentang_asli($mulai, $selesai) { return $selesai ? str_replace(":", ".", substr($mulai, 0, 5) . "-" . substr($selesai, 0, 5)) : rentang($mulai); }
function hari_dari_tanggal($tgl) { return HARI[(int) date("N", strtotime($tgl))]; }

// ---------- status pengajuan ----------
// Lokal: trigger trg_notif_voting di MySQL yang kirim notifikasi.
// Online (TiDB tidak mendukung trigger/procedure): logika yang sama dijalankan di PHP.
function hasil_rekap($db, $id) {
    $r = satu($db, "SELECT hasil FROM rekap_voting WHERE id_pengajuan = ?", "i", $id);
    return ($r && $r["hasil"] === "LOLOS") ? "disetujui" : "ditolak";
}
function ubah_status($db, $id, $baru, $id_admin = null) {
    $lama = satu($db, "SELECT status FROM pengajuan_perubahan WHERE id_pengajuan = ?", "i", $id)["status"] ?? null;
    if ($id_admin) jalankan($db, "UPDATE pengajuan_perubahan SET status = ?, id_admin = ? WHERE id_pengajuan = ?", "sii", $baru, $id_admin, $id);
    else           jalankan($db, "UPDATE pengajuan_perubahan SET status = ? WHERE id_pengajuan = ?", "si", $baru, $id);
    if (MODE_CLOUD && $lama !== null && $lama !== $baru) notif_status($db, $id, $lama, $baru);
}
function notif_status($db, $id, $lama, $baru) {
    $p = satu($db, "SELECT id_jadwal, id_dosen, jadwal_usulan FROM pengajuan_perubahan WHERE id_pengajuan = ?", "i", $id);
    if ($baru === "voting" && $lama !== "voting") {
        jalankan($db, "INSERT INTO notifikasi (id_pengguna, isi)
            SELECT m.id_pengguna, CONCAT('Usulan baru: ', j.mata_kuliah, ' dipindah ke ', DATE_FORMAT(?, '%d-%m-%Y %H:%i'), '. Silakan beri suara.')
            FROM jadwal_kuliah j JOIN mahasiswa m ON m.kelas = j.kelas WHERE j.id_jadwal = ?", "si", $p["jadwal_usulan"], $p["id_jadwal"]);
    }
    if (in_array($baru, ["disetujui", "ditolak"], true)) {
        $ok = $baru === "disetujui";
        jalankan($db, "INSERT INTO notifikasi (id_pengguna, isi)
            SELECT m.id_pengguna, CONCAT('Hasil voting ', j.mata_kuliah, ': ', ?)
            FROM jadwal_kuliah j JOIN mahasiswa m ON m.kelas = j.kelas WHERE j.id_jadwal = ?", "si",
            $ok ? "jadwal resmi pindah." : "jadwal tetap.", $p["id_jadwal"]);
        jalankan($db, "INSERT INTO notifikasi (id_pengguna, isi)
            SELECT d.id_pengguna, CONCAT('Hasil voting ', j.mata_kuliah, ': ', ?)
            FROM jadwal_kuliah j JOIN dosen d ON d.id_dosen = ? WHERE j.id_jadwal = ?", "sii",
            $ok ? "disetujui." : "tidak lolos, boleh ajukan ulang (maks 3x).", $p["id_dosen"], $p["id_jadwal"]);
    }
}
// Tutup otomatis voting yang sudah lewat H-7 (FR-06, FR-07)
function tutup_voting_kedaluwarsa($db) {
    if (!MODE_CLOUD) { $db->query("CALL tutup_voting_kedaluwarsa()"); return; }
    foreach (semua($db, "SELECT id_pengajuan FROM pengajuan_perubahan WHERE status = 'voting' AND CURDATE() > batas_waktu") as $r) {
        $id = (int) $r["id_pengajuan"];
        ubah_status($db, $id, hasil_rekap($db, $id));
    }
}
