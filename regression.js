/**
 * Modul Analisis Keuangan - Regresi Linear Sederhana
 * Skripsi: Aplikasi Pencatat Keuangan Mahasiswa + AI Forecast
 */

class FinancialForecast {
    /**
     * Menghitung parameter Regresi Linear Sederhana (y = mx + c)
     * @param {Array<number>} x - Indeks hari (1, 2, 3...)
     * @param {Array<number>} y - Pengeluaran kumulatif sampai hari tersebut
     * @returns {Object} { slope (m), intercept (c), rSquared }
     */
    static linearRegression(x, y) {
        const n = x.length;
        if (n < 2) {
            return { slope: 0, intercept: 0, rSquared: 0 };
        }

        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
        for (let i = 0; i < n; i++) {
            sumX += x[i];
            sumY += y[i];
            sumXY += x[i] * y[i];
            sumXX += x[i] * x[i];
            sumYY += y[i] * y[i];
        }

        // Hitung slope (m) dan intercept (c)
        const denominator = (n * sumXX - sumX * sumX);
        if (denominator === 0) {
            return { slope: 0, intercept: 0, rSquared: 0 };
        }

        const slope = (n * sumXY - sumX * sumY) / denominator;
        const intercept = (sumY - slope * sumX) / n;

        // Hitung R-Squared (koefisien determinasi) untuk mengukur kekuatan korelasi
        const xMean = sumX / n;
        const yMean = sumY / n;
        let ssRegression = 0;
        let ssTotal = 0;

        for (let i = 0; i < n; i++) {
            const yPred = slope * x[i] + intercept;
            ssRegression += Math.pow(yPred - yMean, 2);
            ssTotal += Math.pow(y[i] - yMean, 2);
        }

        const rSquared = ssTotal === 0 ? 0 : ssRegression / ssTotal;

        return { slope, intercept, rSquared };
    }

    /**
     * Melakukan analisis keuangan mahasiswa dan memberikan rekomendasi
     * @param {Object} data - Objek data keuangan
     * @param {number} data.budgetAwal - Jumlah uang saku awal bulanan
     * @param {number} data.saldoSaatIni - Saldo riil saat ini (Budget awal - Pengeluaran + Pemasukan)
     * @param {string} data.tanggalMulai - Tanggal awal siklus anggaran (YYYY-MM-DD)
     * @param {string} data.tanggalSelesai - Tanggal akhir siklus anggaran / kiriman berikutnya (YYYY-MM-DD)
     * @param {Array<Object>} data.transaksi - Daftar transaksi pengeluaran { tanggal: 'YYYY-MM-DD', jumlah: number }
     * @returns {Object} Hasil analisis proyeksi dan rekomendasi
     */
    static analyze(data) {
        const { budgetAwal, saldoSaatIni, tanggalMulai, tanggalSelesai, transaksi } = data;
        const targetMenabung = parseFloat(data.targetMenabung) || 0;

        const start = new Date(tanggalMulai);
        const end = new Date(tanggalSelesai);
        const today = new Date();
        today.setHours(0,0,0,0);

        // Hitung total hari dalam siklus budget
        const totalHariSiklus = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        
        // Hitung hari ke-berapa hari ini dalam siklus (1-indexed)
        const hariKeSaatIni = Math.ceil((today - start) / (1000 * 60 * 60 * 24)) + 1;
        
        // Sisa hari menuju target kiriman berikutnya
        const sisaHariTarget = Math.max(0, Math.ceil((end - today) / (1000 * 60 * 60 * 24)));

        // Hitung total pemasukan tambahan selama siklus berjalan
        const totalPemasukan = transaksi
            .filter(t => t.tipe === 'pemasukan')
            .reduce((sum, t) => sum + parseFloat(t.jumlah), 0);

        // Batas maksimal belanja kumulatif agar tabungan aman (menggabungkan pemasukan tambahan)
        const batasMaksimalBelanja = budgetAwal - targetMenabung + totalPemasukan;
        const saldoEfektifBelanja = saldoSaatIni - targetMenabung;

        // Kelompokkan transaksi pengeluaran berdasarkan tanggal untuk menghitung kumulatif harian
        const pengeluaranPerHari = {};
        const pengeluaranSaja = transaksi
            .filter(t => t.tipe === 'pengeluaran')
            .sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));

        pengeluaranSaja.forEach(t => {
            const tDate = new Date(t.tanggal);
            tDate.setHours(0,0,0,0);
            
            // Hitung hari ke-berapa transaksi ini dari tanggal mulai (1-indexed)
            const hariKe = Math.ceil((tDate - start) / (1000 * 60 * 60 * 24)) + 1;
            
            // Masukkan jika transaksi berada dalam rentang siklus budget
            if (hariKe >= 1 && hariKe <= totalHariSiklus) {
                pengeluaranPerHari[hariKe] = (pengeluaranPerHari[hariKe] || 0) + parseFloat(t.jumlah);
            }
        });

        // Bangun data koordinat X (hari) dan Y (pengeluaran harian riil)
        const x = [];
        const y = [];

        // Kita isi tiap hari dari hari ke-1 hingga hari ke-berapa transaksi terakhir terdeteksi (maksimal hariKeSaatIni)
        const maxHariData = Object.keys(pengeluaranPerHari).length > 0 
            ? Math.max(...Object.keys(pengeluaranPerHari).map(Number)) 
            : 0;

        for (let day = 1; day <= Math.max(maxHariData, 1); day++) {
            x.push(day);
            y.push(pengeluaranPerHari[day] || 0); // Pengeluaran harian riil (non-kumulatif)
        }

        // Hitung total pengeluaran riil saat ini
        const totalPengeluaranRiil = pengeluaranSaja.reduce((sum, t) => sum + parseFloat(t.jumlah), 0);
        
        // Rata-rata pengeluaran harian riil
        const rataRataPengeluaranHarian = maxHariData > 0 
            ? Math.floor(totalPengeluaranRiil / maxHariData) 
            : 0;

        // Jatah harian ideal di awal siklus
        const jatahIdealAwal = totalHariSiklus > 0 
            ? Math.max(0, (budgetAwal - targetMenabung) / totalHariSiklus) 
            : 0;

        // Hitung Burn Rate Coefficient (BRC)
        const BRC = jatahIdealAwal > 0 ? rataRataPengeluaranHarian / jatahIdealAwal : 0;

        // Hitung breakdown pengeluaran per kategori
        const pengeluaranKategori = {};
        pengeluaranSaja.forEach(t => {
            pengeluaranKategori[t.kategori] = (pengeluaranKategori[t.kategori] || 0) + parseFloat(t.jumlah);
        });

        // Cari kategori terboros
        let kategoriTerboros = "Tidak Ada";
        let nominalTerboros = 0;
        let persentaseTerboros = 0;
        const displayKategori = {
            makanan: "Makanan & Minuman",
            kos: "Kos & Kebutuhan",
            pendidikan: "Kuliah & Pendidikan",
            transportasi: "Transportasi",
            hiburan: "Hiburan & Nongkrong",
            lainnya: "Lainnya"
        };

        Object.keys(pengeluaranKategori).forEach(cat => {
            if (pengeluaranKategori[cat] > nominalTerboros) {
                nominalTerboros = pengeluaranKategori[cat];
                kategoriTerboros = cat;
            }
        });

        if (totalPengeluaranRiil > 0 && nominalTerboros > 0) {
            persentaseTerboros = Math.round((nominalTerboros / totalPengeluaranRiil) * 100);
        }

        // Potensi hemat harian (20% dari rata-rata pengeluaran kategori terboros)
        const potensiHematHarian = maxHariData > 0 
            ? Math.round((nominalTerboros * 0.20) / maxHariData) 
            : 0;

        // Default hasil analisis jika data kurang (Estimasi Awal / Cold-Start)
        let status = "Estimasi Awal";
        let statusColor = "var(--primary)";
        let statusMessage = "Menggunakan proyeksi anggaran ideal. Proyeksi regresi akan aktif dinamis setelah mencatat transaksi minimal di 2 hari berbeda.";
        let tanggalHabisPrediksi = end;
        let sisaHariUangHabis = sisaHariTarget;
        let rSquaredVal = 1.0;
        let slopeVal = -jatahIdealAwal;
        let interceptVal = budgetAwal - targetMenabung;
        let rmseVal = 0;
        let rmseNaiveVal = 0;
        let hasSplitValidation = false;
        let hariHabis = totalHariSiklus;
        let stdErrorEst = 0;

        // Minimal butuh data dari 2 hari berbeda untuk regresi linear
        if (x.length >= 2) {
            // Split Train/Test 70/30 jika data hari >= 4
            if (x.length >= 4) {
                const nTrain = Math.floor(0.7 * x.length);
                const nTest = x.length - nTrain;
                
                const xTrain = x.slice(0, nTrain);
                const yTrain = y.slice(0, nTrain);
                const xTest = x.slice(nTrain);
                const yTest = y.slice(nTrain);
                
                // Fit on train
                const regTrain = this.linearRegression(xTrain, yTrain);
                
                // Naive average baseline on train
                const yTrainMean = yTrain.reduce((sum, val) => sum + val, 0) / nTrain;
                
                // Evaluate on test split
                let sumSqErrReg = 0;
                let sumSqErrNaive = 0;
                for (let i = 0; i < nTest; i++) {
                    const yPredReg = regTrain.slope * xTest[i] + regTrain.intercept;
                    sumSqErrReg += Math.pow(yTest[i] - yPredReg, 2);
                    sumSqErrNaive += Math.pow(yTest[i] - yTrainMean, 2);
                }
                
                rmseVal = Math.sqrt(sumSqErrReg / nTest);
                rmseNaiveVal = Math.sqrt(sumSqErrNaive / nTest);
                hasSplitValidation = true;
            }

            // Fit full model on all data for forecasting
            const regFull = this.linearRegression(x, y);
            slopeVal = regFull.slope;
            interceptVal = regFull.intercept;
            rSquaredVal = regFull.rSquared;

            // Jika belum split, hitung training RMSE
            if (!hasSplitValidation) {
                let sumSquaredErrors = 0;
                for (let i = 0; i < x.length; i++) {
                    const yPred = slopeVal * x[i] + interceptVal;
                    sumSquaredErrors += Math.pow(y[i] - yPred, 2);
                }
                rmseVal = Math.sqrt(sumSquaredErrors / x.length);
                
                // Naive training error baseline
                const yMean = y.reduce((sum, val) => sum + val, 0) / x.length;
                let sumSqNaive = 0;
                for (let i = 0; i < x.length; i++) {
                    sumSqNaive += Math.pow(y[i] - yMean, 2);
                }
                rmseNaiveVal = Math.sqrt(sumSqNaive / x.length);
            }

            // Hitung Standard Error of Estimate (Residual Standard Deviation)
            let sumSqResiduals = 0;
            for (let i = 0; i < x.length; i++) {
                const yPred = slopeVal * x[i] + interceptVal;
                sumSqResiduals += Math.pow(y[i] - yPred, 2);
            }
            const divisor = x.length > 2 ? x.length - 2 : x.length;
            stdErrorEst = Math.sqrt(sumSqResiduals / divisor);

            // Proyeksi sisa hari saldo habis menggunakan Integrasi Kuadratik
            hariHabis = 0;
            if (Math.abs(slopeVal) < 0.1) {
                // Selesaikan secara linear jika trend slope hampir datar (m ~ 0)
                hariHabis = interceptVal > 0 ? batasMaksimalBelanja / interceptVal : totalHariSiklus;
            } else {
                const a = slopeVal / 2;
                const b = interceptVal + slopeVal / 2;
                const cQuad = -batasMaksimalBelanja;
                const discriminant = b * b - 4 * a * cQuad;
                
                if (discriminant >= 0) {
                    const root1 = (-b + Math.sqrt(discriminant)) / (2 * a);
                    const root2 = (-b - Math.sqrt(discriminant)) / (2 * a);
                    hariHabis = Math.max(root1, root2); // ambil hari yang bernilai positif
                } else {
                    // Tren pengeluaran menurun tajam (tidak akan pernah memotong batas budget)
                    hariHabis = totalHariSiklus + 30; // aman melewati siklus
                }
            }

            if (isNaN(hariHabis) || hariHabis <= 0) {
                hariHabis = totalHariSiklus;
            }

            // Konversikan indeks hariHabis kembali ke tanggal kalender
            const tanggalHabis = new Date(start);
            tanggalHabis.setDate(start.getDate() + Math.round(hariHabis - 1));
            tanggalHabis.setHours(0,0,0,0);

            tanggalHabisPrediksi = tanggalHabis;
            sisaHariUangHabis = Math.max(0, Math.ceil((tanggalHabis - today) / (1000 * 60 * 60 * 24)));

            // Tentukan status kuantitatif berbasis BRC dan sisa saldo
            if (saldoSaatIni < targetMenabung || BRC > 1.25 || tanggalHabis <= today) {
                status = "Sangat Kritis";
                statusColor = "#EF4444"; // Merah
                    statusMessage = `Pola pengeluaran Anda sangat cepat (${Math.round(BRC * 100)}% dari jatah ideal harian). Sisa dana belanja kritis dan terancam melanggar target tabungan.`;
                } else if (BRC > 1.0 || tanggalHabis < end) {
                    status = "Peringatan";
                    statusColor = "#F59E0B"; // Oranye
                    const persenMelebihi = Math.round((BRC - 1.0) * 100);
                    statusMessage = `Pengeluaran harian melebihi jatah ideal sebesar ${persenMelebihi}%. AI memprediksi batas belanja terlampaui ${Math.ceil((end - tanggalHabis) / (1000 * 60 * 60 * 24))} hari lebih cepat.`;
                } else if (rataRataPengeluaranHarian > 0) {
                    status = "Aman";
                    statusColor = "#10B981"; // Hijau
                    statusMessage = `Pola belanja terkendali dengan baik. Pengeluaran harian Anda hanya sekitar ${Math.round(BRC * 100)}% dari batas jatah harian ideal Anda.`;
                } else {
                    status = "Aman";
                    statusColor = "#10B981";
                    statusMessage = "Kecepatan pengeluaran Anda sangat lambat atau nol. Keuangan Anda saat ini terpantau sangat aman.";
                }
        } else if (x.length === 1 && saldoSaatIni < budgetAwal) {
            // Fallback sederhana jika baru 1 hari mencatat pengeluaran
            const pengeluaranHariPertama = parseFloat(y[0]) || 0;
            const perkiraanSisaHari = pengeluaranHariPertama > 0 
                ? Math.max(0, saldoEfektifBelanja) / pengeluaranHariPertama
                : totalHariSiklus;
                
            const validSisaHari = (isFinite(perkiraanSisaHari) && !isNaN(perkiraanSisaHari)) ? perkiraanSisaHari : totalHariSiklus;
            
            const tanggalHabis = new Date(today);
            tanggalHabis.setDate(today.getDate() + Math.floor(validSisaHari));
            
            tanggalHabisPrediksi = tanggalHabis;
            sisaHariUangHabis = Math.max(0, Math.ceil((tanggalHabis - today) / (1000 * 60 * 60 * 24)));
            
            status = "Analisis Awal";
            statusColor = "#3B82F6"; // Biru
            statusMessage = targetMenabung > 0
                ? `Berdasarkan pengeluaran hari pertama, saldo belanja diperkirakan bertahan sekitar ${Math.floor(validSisaHari)} hari sebelum menyentuh batas tabungan.`
                : `Berdasarkan pengeluaran hari pertama Anda, uang diperkirakan bertahan sekitar ${Math.floor(validSisaHari)} hari lagi (hingga ${this.formatDateIndo(tanggalHabis)}).`;
        }

        // Rekomendasi batas anggaran harian (memotong target tabungan)
        let rekomendasiBatasHarian = 0;
        if (sisaHariTarget > 0) {
            rekomendasiBatasHarian = Math.max(0, Math.floor(saldoEfektifBelanja / sisaHariTarget));
        } else {
            rekomendasiBatasHarian = Math.max(0, saldoEfektifBelanja); // Jika hari ini adalah hari terakhir
        }

        return {
            status,
            statusColor,
            statusMessage,
            tanggalHabisPrediksi: tanggalHabisPrediksi ? this.formatDateIndo(tanggalHabisPrediksi) : "Tidak Terdeteksi",
            sisaHariUangHabis: sisaHariUangHabis !== null ? `${sisaHariUangHabis} Hari` : "-",
            rekomendasiBatasHarian,
            rataRataPengeluaranHarian,
            totalHariSiklus,
            hariKeSaatIni: Math.min(hariKeSaatIni, totalHariSiklus),
            sisaHariTarget,
            rSquared: rSquaredVal,
            rmse: rmseVal,
            rmseNaive: rmseNaiveVal,
            kecepatanHarian: Math.floor(slopeVal),
            intercept: interceptVal,
            hariKeHabis: hariHabis,
            stdErrorEst: stdErrorEst,
            targetMenabung,
            saldoEfektifBelanja,
            totalPemasukan,
            batasMaksimalBelanja,
            brc: BRC,
            jatahIdealAwal,
            kategoriTerboros: displayKategori[kategoriTerboros] || kategoriTerboros,
            persentaseTerboros,
            potensiHematHarian
        };
    }

    /**
     * Memformat objek Date ke format Indonesia (e.g. 17 Agustus 2026)
     * @param {Date} date 
     * @returns {string}
     */
    static formatDateIndo(date) {
        const bulan = [
            "Januari", "Februari", "Maret", "April", "Mei", "Juni",
            "Juli", "Agustus", "September", "Oktober", "November", "Desember"
        ];
        return `${date.getDate()} ${bulan[date.getMonth()]} ${date.getFullYear()}`;
    }
}
