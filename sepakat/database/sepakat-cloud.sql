-- =====================================================================
-- SEPAKAT (Sistem Penyesuaian Jadwal Kuliah Terpadu) - Kelompok 2 APSI
-- Database MySQL / MariaDB, sesuai ERD Bab V (9 tabel)
-- VERSI ONLINE (TiDB Cloud) untuk deploy Vercel.
-- Bedanya dengan sepakat.sql: tanpa TRIGGER/PROCEDURE/EVENT (TiDB tidak mendukung,
-- logikanya sudah dipindah ke api/koneksi.php) + tabel `sesi` untuk login.
-- Cara pakai: TiDB Cloud > SQL Editor > tempel seluruh isi file ini > Run all
-- =====================================================================

DROP DATABASE IF EXISTS sepakat;
CREATE DATABASE sepakat CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE sepakat;

-- ---------------------------------------------------------------------
-- 1. pengguna : akun login semua aktor
-- ---------------------------------------------------------------------
CREATE TABLE pengguna (
  id_pengguna INT AUTO_INCREMENT PRIMARY KEY,
  nama        VARCHAR(100) NOT NULL,
  username    VARCHAR(50)  NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,            -- simpan hasil password_hash() PHP
  peran       ENUM('dosen','mahasiswa','fakultas_admin') NOT NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. dosen
-- ---------------------------------------------------------------------
CREATE TABLE dosen (
  id_dosen    INT AUTO_INCREMENT PRIMARY KEY,
  id_pengguna INT NOT NULL UNIQUE,
  nidn        VARCHAR(20) NOT NULL UNIQUE,
  FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. fakultas_admin
-- ---------------------------------------------------------------------
CREATE TABLE fakultas_admin (
  id_admin    INT AUTO_INCREMENT PRIMARY KEY,
  id_pengguna INT NOT NULL UNIQUE,
  FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. mahasiswa : kelas dipakai untuk menyaring voting & notifikasi
-- ---------------------------------------------------------------------
CREATE TABLE mahasiswa (
  id_mahasiswa INT AUTO_INCREMENT PRIMARY KEY,
  id_pengguna  INT NOT NULL UNIQUE,
  npm          VARCHAR(20) NOT NULL UNIQUE,
  kelas        VARCHAR(20) NOT NULL,
  FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna) ON DELETE CASCADE,
  INDEX idx_kelas (kelas)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. ruang
-- ---------------------------------------------------------------------
CREATE TABLE ruang (
  id_ruang   INT AUTO_INCREMENT PRIMARY KEY,
  nama_ruang VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. jadwal_kuliah : satu ruang tidak boleh dipakai 2 kuliah di hari & jam sama (FR-04)
-- ---------------------------------------------------------------------
CREATE TABLE jadwal_kuliah (
  id_jadwal   INT AUTO_INCREMENT PRIMARY KEY,
  mata_kuliah VARCHAR(100) NOT NULL,
  kelas       VARCHAR(20)  NOT NULL,
  hari        VARCHAR(10)  NOT NULL,
  jam         TIME         NOT NULL,
  id_ruang    INT NOT NULL,
  id_dosen    INT NOT NULL,
  FOREIGN KEY (id_ruang) REFERENCES ruang(id_ruang),
  FOREIGN KEY (id_dosen) REFERENCES dosen(id_dosen),
  UNIQUE KEY uq_ruang_slot (id_ruang, hari, jam)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. pengajuan_perubahan (FR-03, FR-04, FR-07, FR-08)
--    batas_waktu  = H-7 sebelum jadwal_usulan = batas pengajuan DAN batas voting
--    jumlah_pengajuan = pengajuan ke-berapa (maks 3)
-- ---------------------------------------------------------------------
CREATE TABLE pengajuan_perubahan (
  id_pengajuan      INT AUTO_INCREMENT PRIMARY KEY,
  id_jadwal         INT NOT NULL,
  id_dosen          INT NOT NULL,
  id_admin          INT NULL,                     -- diisi saat Fakultas/Admin memilih ruang & jam
  jadwal_usulan     DATETIME NOT NULL,
  id_ruang_usulan   INT NULL,
  alasan            TEXT NOT NULL,
  tanggal_pengajuan DATE NOT NULL,
  batas_waktu       DATE NOT NULL,
  status            ENUM('menunggu','voting','disetujui','ditolak') NOT NULL DEFAULT 'menunggu',
  jumlah_pengajuan  INT NOT NULL DEFAULT 1,
  FOREIGN KEY (id_jadwal)       REFERENCES jadwal_kuliah(id_jadwal),
  FOREIGN KEY (id_dosen)        REFERENCES dosen(id_dosen),
  FOREIGN KEY (id_admin)        REFERENCES fakultas_admin(id_admin),
  FOREIGN KEY (id_ruang_usulan) REFERENCES ruang(id_ruang),
  CHECK (jumlah_pengajuan BETWEEN 1 AND 3),       -- FR-08: maksimal 3x
  CHECK (tanggal_pengajuan < batas_waktu),        -- FR-07: diajukan sebelum H-7
  CHECK (batas_waktu = DATE(jadwal_usulan) - INTERVAL 7 DAY)   -- batas = H-7
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. voting (FR-05, FR-06, FR-09, FR-10)
--    satu mahasiswa hanya satu suara per pengajuan
-- ---------------------------------------------------------------------
CREATE TABLE voting (
  id_voting       INT AUTO_INCREMENT PRIMARY KEY,
  id_pengajuan    INT NOT NULL,
  id_mahasiswa    INT NOT NULL,
  pilihan         ENUM('setuju','tidak_setuju') NOT NULL,
  alasan_menolak  TEXT NULL,                       -- wajib jika tidak_setuju (FR-10)
  opsi_alternatif VARCHAR(100) NULL,               -- usulan jadwal lain (FR-09)
  waktu_voting    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_pengajuan) REFERENCES pengajuan_perubahan(id_pengajuan) ON DELETE CASCADE,
  FOREIGN KEY (id_mahasiswa) REFERENCES mahasiswa(id_mahasiswa) ON DELETE CASCADE,
  UNIQUE KEY uq_satu_suara (id_pengajuan, id_mahasiswa),
  CHECK (pilihan = 'setuju' OR (alasan_menolak IS NOT NULL AND alasan_menolak <> ''))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 9. notifikasi (FR-01) : dibaca halaman web & dipakai untuk pop-up di HP
-- ---------------------------------------------------------------------
CREATE TABLE notifikasi (
  id_notifikasi INT AUTO_INCREMENT PRIMARY KEY,
  id_pengguna   INT NOT NULL,
  isi           TEXT NOT NULL,
  waktu_kirim   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status_baca   BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna) ON DELETE CASCADE,
  INDEX idx_belum_dibaca (id_pengguna, status_baca)
) ENGINE=InnoDB;

-- =====================================================================
-- VIEW rekap_voting (FR-06): hitung suara otomatis, lolos jika > 50%
-- persen dihitung dari seluruh mahasiswa di kelas tersebut
-- =====================================================================
CREATE VIEW rekap_voting AS
SELECT p.id_pengajuan,
       j.mata_kuliah,
       j.kelas,
       COALESCE(SUM(v.pilihan = 'setuju'),0)       AS jumlah_setuju,
       COALESCE(SUM(v.pilihan = 'tidak_setuju'),0) AS jumlah_tidak_setuju,
       (SELECT COUNT(*) FROM mahasiswa m WHERE m.kelas = j.kelas) AS jumlah_mahasiswa,
       ROUND(100 * COALESCE(SUM(v.pilihan = 'setuju'),0) /
             (SELECT COUNT(*) FROM mahasiswa m WHERE m.kelas = j.kelas), 1) AS persen_setuju,
       IF(COALESCE(SUM(v.pilihan = 'setuju'),0) * 2 >
          (SELECT COUNT(*) FROM mahasiswa m WHERE m.kelas = j.kelas), 'LOLOS', 'TIDAK LOLOS') AS hasil
FROM pengajuan_perubahan p
JOIN jadwal_kuliah j ON j.id_jadwal = p.id_jadwal
LEFT JOIN voting v   ON v.id_pengajuan = p.id_pengajuan
GROUP BY p.id_pengajuan, j.mata_kuliah, j.kelas;

-- ---------------------------------------------------------------------
-- 10. sesi : penyimpanan sesi login PHP (khusus versi online / Vercel)
-- ---------------------------------------------------------------------
CREATE TABLE sesi (
  id    VARCHAR(128) PRIMARY KEY,
  data  MEDIUMTEXT NOT NULL,
  waktu INT NOT NULL,
  INDEX idx_waktu (waktu)
);

-- =====================================================================
-- DATA CONTOH (password semua akun: sepakat123, bentuk hash bcrypt PHP)
-- =====================================================================
INSERT INTO pengguna (nama, username, password, peran) VALUES
 ('Siska, M.Kom.',            '0412038801',     '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'dosen'),
 ('Bagian Akademik Fakultas', 'admin',          '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'fakultas_admin'),
 ('Anisa Putri Amelia', '2510631250004', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Line Budiarti', '2510631250007', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Hadid Kurnia Fadillah', '2510631250010', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Salwa Khalipa', '2510631250013', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Salsabila Fadillah Putri', '2510631250016', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Marsya Bella Puspita Rizky', '2510631250019', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Meyla Sabrina', '2510631250022', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Aqila Maulana Ikhsan', '2510631250025', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Beby Naila Putri', '2510631250028', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Fajar Raihan Hanafi', '2510631250031', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Muhammad Aji Nur Majid', '2510631250037', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Mukhlash Hisyam', '2510631250040', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Reihan Alfa Setiawan', '2510631250043', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Savina Hayati Ramadhani', '2510631250046', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Sofian', '2510631250049', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Alma Laila', '2510631250052', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Azkiya Aulia Hidayah', '2510631250055', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Emira Dahilvis', '2510631250058', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Fathu Zaky Nugraha', '2510631250061', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Junaedi Adi Prasetyo', '2510631250064', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Lutfi Radithia Firmansyah', '2510631250067', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Muhamad Irfan Zainudin', '2510631250070', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Naufal Fathir Hidayat', '2510631250073', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa'),
 ('Nazwa Cindy Cantika', '2510631250001', '$2y$10$3YujQ4hUiMJ5Uoxpgbfc8uzsUMBeqQuxIIaFEk9klqmYyU718.tmi', 'mahasiswa');

INSERT INTO dosen (id_pengguna, nidn) VALUES (1, '0412038801');
INSERT INTO fakultas_admin (id_pengguna) VALUES (2);
INSERT INTO mahasiswa (id_pengguna, npm, kelas) VALUES
 (3, '2510631250004', 'SI-3A'),
 (4, '2510631250007', 'SI-3A'),
 (5, '2510631250010', 'SI-3A'),
 (6, '2510631250013', 'SI-3A'),
 (7, '2510631250016', 'SI-3A'),
 (8, '2510631250019', 'SI-3A'),
 (9, '2510631250022', 'SI-3A'),
 (10, '2510631250025', 'SI-3A'),
 (11, '2510631250028', 'SI-3A'),
 (12, '2510631250031', 'SI-3A'),
 (13, '2510631250037', 'SI-3A'),
 (14, '2510631250040', 'SI-3A'),
 (15, '2510631250043', 'SI-3A'),
 (16, '2510631250046', 'SI-3A'),
 (17, '2510631250049', 'SI-3A'),
 (18, '2510631250052', 'SI-3A'),
 (19, '2510631250055', 'SI-3A'),
 (20, '2510631250058', 'SI-3A'),
 (21, '2510631250061', 'SI-3A'),
 (22, '2510631250064', 'SI-3A'),
 (23, '2510631250067', 'SI-3A'),
 (24, '2510631250070', 'SI-3A'),
 (25, '2510631250073', 'SI-3A'),
 (26, '2510631250001', 'SI-3A');

INSERT INTO ruang (nama_ruang) VALUES ('FIK 2.03'), ('FIK 3.01'), ('Lab 1'), ('Lab 2');

INSERT INTO jadwal_kuliah (mata_kuliah, kelas, hari, jam, id_ruang, id_dosen) VALUES
 ('Analisis dan Perancangan Sistem Informasi', 'SI-3A', 'Senin', '08:00:00', 1, 1),
 ('Basis Data',                                 'SI-3A', 'Rabu',  '10:30:00', 3, 1),
 ('Pemrograman Web',                            'SI-3A', 'Kamis', '13:00:00', 4, 1),
 -- jadwal kuliah lain kelas SI-3A (supaya terlihat ruang & jam yang sudah terisi, FR-03/FR-04)
 ('Statistika',              'SI-3A', 'Senin',  '13:00:00', 2, 1),
 ('Algoritma',               'SI-3A', 'Senin',  '10:30:00', 3, 1),
 ('Matematika Diskrit',      'SI-3A', 'Selasa', '08:00:00', 1, 1),
 ('Jaringan Komputer',       'SI-3A', 'Selasa', '10:30:00', 4, 1),
 ('Etika Profesi',           'SI-3A', 'Selasa', '15:30:00', 2, 1),
 ('Bahasa Inggris',          'SI-3A', 'Rabu',   '08:00:00', 1, 1),
 ('Praktikum Basis Data',    'SI-3A', 'Rabu',   '13:00:00', 3, 1),
 ('Sistem Operasi',          'SI-3A', 'Kamis',  '08:00:00', 2, 1),
 ('Pancasila',               'SI-3A', 'Jumat',  '08:00:00', 1, 1),
 ('Kewarganegaraan',         'SI-3A', 'Jumat',  '13:00:00', 3, 1);

-- Pengajuan 1: sudah dibuka voting oleh Fakultas/Admin
INSERT INTO pengajuan_perubahan
 (id_jadwal, id_dosen, id_admin, jadwal_usulan, id_ruang_usulan, alasan,
  tanggal_pengajuan, batas_waktu, status, jumlah_pengajuan)
VALUES
 -- tanggal dibuat relatif terhadap hari import, supaya contoh voting selalu masih dibuka
 (1, 1, NULL, CURDATE() + INTERVAL 10 DAY + INTERVAL 13 HOUR, NULL, 'Dosen mengikuti seminar nasional pada hari Senin.',
  CURDATE(), CURDATE() + INTERVAL 3 DAY, 'menunggu', 1),
 (3, 1, NULL, CURDATE() + INTERVAL 12 DAY + INTERVAL 810 MINUTE, NULL, 'Ruang Lab 2 dipakai ujian sertifikasi.',
  CURDATE(), CURDATE() + INTERVAL 5 DAY, 'menunggu', 1);

-- Fakultas/Admin memilih ruang & jam, lalu membuka voting
UPDATE pengajuan_perubahan SET id_admin = 1, id_ruang_usulan = 1, status = 'voting' WHERE id_pengajuan = 1;
-- (versi XAMPP: dikirim trigger; versi online: ditulis langsung di sini)
INSERT INTO notifikasi (id_pengguna, isi)
SELECT m.id_pengguna, CONCAT('Usulan baru: ', j.mata_kuliah, ' dipindah ke ',
       DATE_FORMAT(p.jadwal_usulan, '%d-%m-%Y %H:%i'), '. Silakan beri suara.')
FROM pengajuan_perubahan p
JOIN jadwal_kuliah j ON j.id_jadwal = p.id_jadwal
JOIN mahasiswa m ON m.kelas = j.kelas
WHERE p.id_pengajuan = 1;

INSERT INTO voting (id_pengajuan, id_mahasiswa, pilihan, alasan_menolak, opsi_alternatif) VALUES
 (1, 1, 'setuju',       NULL, NULL),
 (1, 2, 'setuju',       NULL, NULL),
 (1, 3, 'setuju',       NULL, NULL),
 (1, 4, 'tidak_setuju', 'Bentrok dengan jadwal praktikum Basis Data kelas lain.', 'Kamis 08.00-10.30'),
 (1, 5, 'setuju',       NULL, NULL),
 (1, 6, 'setuju',       NULL, NULL),
 (1, 7, 'setuju',       NULL, NULL),
 (1, 8, 'setuju',       NULL, NULL),
 (1, 9, 'setuju',       NULL, NULL),
 (1, 10, 'setuju',       NULL, NULL),
 (1, 11, 'setuju',       NULL, NULL),
 (1, 12, 'setuju',       NULL, NULL),
 (1, 13, 'setuju',       NULL, NULL),
 (1, 14, 'setuju',       NULL, NULL),
 (1, 15, 'tidak_setuju', 'Selasa siang ada kegiatan organisasi.', NULL);

-- =====================================================================
-- CONTOH QUERY (untuk Bab V / pengujian)
-- =====================================================================
-- Ruang & jam kosong pada hari Selasa 13:00 (FR-03):
--   SELECT r.nama_ruang FROM ruang r
--   WHERE r.id_ruang NOT IN (SELECT id_ruang FROM jadwal_kuliah WHERE hari='Selasa' AND jam='13:00:00');
-- Sisa hari voting (hitung mundur):
--   SELECT id_pengajuan, batas_waktu, DATEDIFF(batas_waktu, CURDATE()) AS sisa_hari FROM pengajuan_perubahan WHERE status='voting';
-- Tutup voting yang lewat H-7: otomatis oleh api/data.php setiap halaman dibuka
-- Rekap voting (FR-06):
--   SELECT * FROM rekap_voting;
-- Notifikasi belum dibaca milik Salwa (FR-01):
--   SELECT isi, waktu_kirim FROM notifikasi WHERE id_pengguna = 3 AND status_baca = FALSE;
