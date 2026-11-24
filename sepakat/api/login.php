<?php
// POST {username, password, peran} -> login dan simpan sesi
require "koneksi.php";
$in = input();
$username = trim($in["username"] ?? "");
$password = $in["password"] ?? "";
$peran    = $in["peran"] ?? "";
if ($username === "" || $password === "") gagal("Username dan password wajib diisi.");

$u = satu($db, "SELECT * FROM pengguna WHERE username = ?", "s", $username);
if (!$u || !password_verify($password, $u["password"])) gagal("Username atau password salah.", 401);
if ($peran && $u["peran"] !== $peran) gagal("Akun ini bukan akun " . str_replace("_", "/", $peran) . ".", 403);

$user = ["id_pengguna" => (int) $u["id_pengguna"], "nama" => $u["nama"], "peran" => $u["peran"]];
if ($u["peran"] === "dosen") {
    $d = satu($db, "SELECT id_dosen, nidn FROM dosen WHERE id_pengguna = ?", "i", $u["id_pengguna"]);
    $user["id_dosen"] = (int) $d["id_dosen"];
} elseif ($u["peran"] === "mahasiswa") {
    $m = satu($db, "SELECT id_mahasiswa, npm, kelas FROM mahasiswa WHERE id_pengguna = ?", "i", $u["id_pengguna"]);
    $user["id_mahasiswa"] = (int) $m["id_mahasiswa"];
    $user["kelas"] = $m["kelas"];
} else {
    $a = satu($db, "SELECT id_admin FROM fakultas_admin WHERE id_pengguna = ?", "i", $u["id_pengguna"]);
    $user["id_admin"] = (int) $a["id_admin"];
}
session_regenerate_id(true);
$_SESSION["user"] = $user;
kirim(["user" => $user]);
