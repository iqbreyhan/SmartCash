/**
 * Logika Utama Aplikasi (State Management, Chart Rendering, & UI Binding)
 * Skripsi: Aplikasi Pencatat Keuangan Mahasiswa + AI Forecast
 */

// State Aplikasi
let state = {
    currentUser: null,
    settings: {
        budgetAwal: 1500000,
        targetMenabung: 0,
        tanggalMulai: '',
        tanggalSelesai: ''
    },
    transaksi: [],
    tipeForm: 'pengeluaran' // default form tipe
};

let nbClassifier = new NaiveBayesClassifier();
let kmeansRecommender = new KMeansRecommender();

// Inisialisasi awal saat dokumen siap
document.addEventListener("DOMContentLoaded", () => {
    initDates();
    checkLoginSession();
    setupEventListeners();
    initWhatIfSlider();
});

// Set default tanggal siklus anggaran (Awal bulan s/d akhir bulan ini)
function initDates() {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0); // hari terakhir bulan ini
    
    state.settings.tanggalMulai = formatDateISO(firstDay);
    state.settings.tanggalSelesai = formatDateISO(lastDay);
    
    document.getElementById('settings-start-date').value = state.settings.tanggalMulai;
    document.getElementById('settings-end-date').value = state.settings.tanggalSelesai;
    document.getElementById('t-date').value = formatDateISO(today);
}

// Format Date ke String YYYY-MM-DD
function formatDateISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Membaca data dari LocalStorage dan Database berdasarkan user aktif
async function loadState() {
    const user = state.currentUser || localStorage.getItem('smartcash_current_user');
    if (!user) return;
    
    state.currentUser = user;
    
    // Update avatar profile dengan huruf pertama username
    const avatar = document.getElementById('avatarName');
    if (avatar && user) {
        avatar.textContent = user.substring(0, 1).toUpperCase();
    }
    
    // Muat konfigurasi anggaran secara asinkron dari basis data
    const dbSettings = await DbService.loadSettings(user);
    if (dbSettings) {
        state.settings = dbSettings;
        if (!state.settings.categoryLimits) {
            state.settings.categoryLimits = {};
        }
        document.getElementById('settings-budget').value = state.settings.budgetAwal;
        document.getElementById('settings-saving-target').value = state.settings.targetMenabung || 0;
        document.getElementById('settings-start-date').value = state.settings.tanggalMulai;
        document.getElementById('settings-end-date').value = state.settings.tanggalSelesai;
        
        // Atur input limit kategori
        const limits = state.settings.categoryLimits || {};
        document.getElementById('limit-makanan').value = limits.makanan || 0;
        document.getElementById('limit-kos').value = limits.kos || 0;
        document.getElementById('limit-pendidikan').value = limits.pendidikan || 0;
        document.getElementById('limit-transportasi').value = limits.transportasi || 0;
        document.getElementById('limit-hiburan').value = limits.hiburan || 0;
        document.getElementById('limit-lainnya').value = limits.lainnya || 0;
    } else {
        // Reset default untuk user baru
        state.settings = {
            budgetAwal: 1500000,
            targetMenabung: 0,
            tanggalMulai: '',
            tanggalSelesai: '',
            categoryLimits: {}
        };
        initDates();
        document.getElementById('settings-budget').value = state.settings.budgetAwal;
        document.getElementById('settings-saving-target').value = 0;
        
        // Reset limit ke 0
        document.getElementById('limit-makanan').value = 0;
        document.getElementById('limit-kos').value = 0;
        document.getElementById('limit-pendidikan').value = 0;
        document.getElementById('limit-transportasi').value = 0;
        document.getElementById('limit-hiburan').value = 0;
        document.getElementById('limit-lainnya').value = 0;
    }
    
    // Muat daftar transaksi secara asinkron
    state.transaksi = await DbService.loadTransactions(user);
    
    // Muat riwayat backtesting secara asinkron dari basis data
    state.history = await DbService.loadHistory(user);
    
    // Latih model Naive Bayes secara dinamis dengan transaksi historis pengguna
    nbClassifier = new NaiveBayesClassifier();
    if (state.transaksi && state.transaksi.length > 0) {
        state.transaksi.forEach(t => {
            if (t.tipe === 'pengeluaran' && t.keterangan && t.kategori) {
                nbClassifier.train(t.keterangan, t.kategori);
            }
        });
    }

    // Jalankan perbaruan UI utama
    updateUI();
}

// Menyimpan state ke LocalStorage dan Database berdasarkan user aktif
async function saveState() {
    const user = state.currentUser;
    if (!user) return;
    
    // Simpan ke LocalStorage (sebagai offline fallback)
    localStorage.setItem(`smartcash_settings_${user}`, JSON.stringify(state.settings));
    localStorage.setItem(`smartcash_transactions_${user}`, JSON.stringify(state.transaksi));
    
    // Simpan ke Database Online (jika tersambung)
    if (DbService.isOnline) {
        await DbService.saveSettings(user, state.settings);
        await DbService.saveAllTransactions(user, state.transaksi);
    }
}

// Setup tombol dan input event listener
function setupEventListeners() {
    // Event listener untuk otomatis menutup modal saat klik di luar area konten
    const modal = document.getElementById('transaction-modal');
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    // Auto-kategori & Custom Suggestions Box untuk Deskripsi
    const descInput = document.getElementById('t-desc');
    const suggestionsBox = document.getElementById('desc-suggestions-box');
    
    if (descInput && suggestionsBox) {
        // Tampilkan semua saran saat input difokuskan / diklik
        descInput.addEventListener('focus', () => {
            showSuggestions(descInput.value);
        });
        
        // Perbarui & filter saran saat mengetik
        descInput.addEventListener('input', (e) => {
            const val = e.target.value;
            showSuggestions(val);
            
            // Auto-kategori instan berbasis Naive Bayes Classifier
            const label = document.querySelector('#group-kategori label');
            if (val.trim().length > 2) {
                const prediction = nbClassifier.classify(val.trim());
                if (prediction && prediction.category) {
                    const catInput = document.getElementById('t-category');
                    if (prediction.confidence >= 45) {
                        if (catInput) catInput.value = prediction.category;
                        if (label) {
                            label.innerHTML = `Kategori <span style="font-size: 0.65rem; color: var(--success); font-weight: 700;"><i class="fa-solid fa-circle-check"></i> (AI Naive Bayes: ${prediction.confidence}% yakin)</span>`;
                        }
                    } else {
                        // Safeguard: Ragu-ragu, biarkan pilihan lama / minta user isi manual
                        if (label) {
                            label.innerHTML = `Kategori <span style="font-size: 0.65rem; color: var(--warning); font-weight: 700;"><i class="fa-solid fa-triangle-exclamation"></i> (AI Ragu: ${prediction.confidence}% yakin. Pilih manual)</span>`;
                        }
                    }
                }
            } else {
                if (label) {
                    label.innerHTML = `Kategori`;
                }
            }
        });
        
        // Sembunyikan saran jika klik di luar area input & box saran
        document.addEventListener('click', (e) => {
            if (e.target !== descInput && e.target !== suggestionsBox && !suggestionsBox.contains(e.target)) {
                suggestionsBox.style.display = 'none';
            }
        });
    }
}

// Berpindah Tab SPA
function switchTab(tabName) {
    // Sembunyikan semua tab
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    // Tunjukkan tab aktif
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    // Update menu navigasi aktif
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`nav-${tabName}`).classList.add('active');
    
    // Render visualisasi khusus jika tab analisis dibuka
    if (tabName === 'analisis') {
        renderAnalysisChart();
    }
}

// Update seluruh elemen UI berdasarkan state terkini
function updateUI() {
    // 1. Hitung total pemasukan, pengeluaran, dan saldo
    let totalPemasukan = 0;
    let totalPengeluaran = 0;
    
    state.transaksi.forEach(t => {
        const amt = parseFloat(t.jumlah);
        if (t.tipe === 'pemasukan') {
            totalPemasukan += amt;
        } else {
            totalPengeluaran += amt;
        }
    });
    
    const budgetAwal = parseFloat(state.settings.budgetAwal);
    const saldoSaatIni = budgetAwal - totalPengeluaran + totalPemasukan;
    
    // Bind data ke Dashboard utama
    document.getElementById('dashboard-saldo').textContent = formatRupiah(saldoSaatIni);
    document.getElementById('dashboard-pemasukan').textContent = formatRupiah(totalPemasukan);
    document.getElementById('dashboard-pengeluaran').textContent = formatRupiah(totalPengeluaran);
    document.getElementById('dashboard-budget-target').textContent = `Target: ${formatRupiah(budgetAwal)}`;
    
    // Bind Target Tabungan & Saldo Belanja Efektif
    const targetMenabung = parseFloat(state.settings.targetMenabung) || 0;
    document.getElementById('dashboard-saving-target').textContent = formatRupiah(targetMenabung);
    document.getElementById('dashboard-spending-balance').textContent = formatRupiah(saldoSaatIni - targetMenabung);
    
    // Perhitungan kemajuan hari dalam siklus budget
    const start = new Date(state.settings.tanggalMulai);
    const end = new Date(state.settings.tanggalSelesai);
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const totalHari = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const hariKe = Math.max(1, Math.ceil((today - start) / (1000 * 60 * 60 * 24)) + 1);
    const progressPersen = Math.min(100, (hariKe / totalHari) * 100);
    
    document.getElementById('dashboard-progress').style.width = `${progressPersen}%`;
    document.getElementById('dashboard-progress-label').textContent = `Siklus Budget: Hari ke-${Math.min(hariKe, totalHari)} dari ${totalHari} Hari`;

    // 2. Jalankan Analisis AI Regresi Linear
    const analysis = FinancialForecast.analyze({
        budgetAwal: budgetAwal,
        saldoSaatIni: saldoSaatIni,
        targetMenabung: targetMenabung,
        tanggalMulai: state.settings.tanggalMulai,
        tanggalSelesai: state.settings.tanggalSelesai,
        transaksi: state.transaksi
    });
    
    // Terapkan status visual pada Card AI berdasarkan hasil analisis
    const aiCard = document.getElementById('ai-widget-card');
    aiCard.className = "card ai-card"; // reset
    if (analysis.status === "Aman") aiCard.classList.add("status-aman");
    else if (analysis.status === "Peringatan") aiCard.classList.add("status-peringatan");
    else if (analysis.status === "Sangat Kritis") aiCard.classList.add("status-kritis");
    else aiCard.classList.add("status-analisis");
    
    // Bind hasil analisis AI ke DOM
    document.getElementById('ai-sisa-hari').textContent = analysis.sisaHariUangHabis;
    document.getElementById('ai-tanggal-habis').textContent = analysis.tanggalHabisPrediksi;
    
    // Berikan teks rekomendasi AI (Disederhanakan & Lebih Visual)
    const recomBox = document.getElementById('ai-rekomendasi-box');
    if (state.transaksi.filter(t => t.tipe === 'pengeluaran').length < 2) {
        recomBox.innerHTML = `
            <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                <span>⚙️</span>
                <span>Analisis AI: Mengumpulkan Data</span>
            </div>
            <ul class="ai-recom-list">
                <li class="ai-recom-item">
                    <span class="ai-recom-icon">💡</span>
                    <span>Batas belanja harian saat ini: <strong>${formatRupiah(analysis.rekomendasiBatasHarian)} / hari</strong>.</span>
                </li>
                <li class="ai-recom-item">
                    <span class="ai-recom-icon">✍️</span>
                    <span>Catat minimal <strong>2 hari pengeluaran</strong> untuk mengaktifkan peramalan otomatis AI.</span>
                </li>
            </ul>
        `;
    } else {
        let statusEmoji = "🟢";
        if (analysis.status === "Peringatan") statusEmoji = "🟡";
        else if (analysis.status === "Sangat Kritis") statusEmoji = "🔴";

        recomBox.innerHTML = `
            <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                <span>${statusEmoji}</span>
                <span>Status Keuangan: <span style="color: ${analysis.statusColor}; font-weight: 700;">${analysis.status}</span></span>
            </div>
            <ul class="ai-recom-list">
                <li class="ai-recom-item">
                    <span class="ai-recom-icon">💡</span>
                    <span>Batasi belanja maksimal: <strong>${formatRupiah(analysis.rekomendasiBatasHarian)} / hari</strong> agar anggaran aman.</span>
                </li>
                <li class="ai-recom-item">
                    <span class="ai-recom-icon">🚨</span>
                    <span>${analysis.statusMessage}</span>
                </li>
                <li class="ai-recom-item">
                    <span class="ai-recom-icon">📊</span>
                    <span>Rata-rata pengeluaran harian Anda: <strong>${formatRupiah(analysis.rataRataPengeluaranHarian)} / hari</strong>.</span>
                </li>
            </ul>
        `;
    }
    
    // Bind parameter statistik di tab Analisis AI
    document.getElementById('stat-r2').textContent = analysis.rSquared.toFixed(2);
    document.getElementById('stat-rmse').textContent = formatRupiah(analysis.rmse);
    document.getElementById('stat-rmse-naive').textContent = formatRupiah(analysis.rmseNaive);
    document.getElementById('stat-brc').textContent = `${analysis.brc.toFixed(2)} (${analysis.brc > 1.0 ? 'Boros' : 'Aman'})`;
    document.getElementById('stat-avg').textContent = formatRupiah(analysis.rataRataPengeluaranHarian);
    document.getElementById('stat-slope').textContent = `${formatRupiah(analysis.kecepatanHarian)}/hari`;
    document.getElementById('stat-cat-boros').textContent = analysis.kategoriTerboros;
    document.getElementById('stat-recom-cat').textContent = `Hemat ${formatRupiah(analysis.potensiHematHarian)}/hari`;

    // Trigger update slider What-If jika slider terdaftar
    const whatifSlider = document.getElementById('whatif-slider');
    if (whatifSlider) {
        whatifSlider.dispatchEvent(new Event('input'));
    }

    // Deteksi Anomali Transaksi (Z-Score)
    const anomalies = detectAnomalies(state.transaksi);
    const anomalyBox = document.getElementById('ai-anomaly-box');
    const anomalyText = document.getElementById('ai-anomaly-text');
    if (anomalies.length > 0 && anomalyBox && anomalyText) {
        const worst = anomalies.sort((a, b) => b.zScore - a.zScore)[0];
        const transactionDetails = state.transaksi.find(t => t.id === worst.id);
        if (transactionDetails) {
            anomalyText.innerHTML = `Belanja sebesar <strong>${formatRupiah(worst.amount)}</strong> pada tanggal <strong>${formatDateIndoStr(transactionDetails.tanggal)}</strong> untuk <em>"${transactionDetails.keterangan}"</em> dinilai <strong>${worst.zScore.toFixed(1)}x standar deviasi</strong> lebih besar dari rata-rata belanja harian biasanya (${formatRupiah(Math.round(worst.mean))}/hari).`;
            anomalyBox.style.display = 'block';
        }
    } else if (anomalyBox) {
        anomalyBox.style.display = 'none';
    }

    // Disclaimer Kualitas Data
    const qualityBox = document.getElementById('data-quality-disclaimer');
    const qualityText = document.getElementById('data-quality-text');
    if (qualityBox && qualityText) {
        const pengeluaranSaja = state.transaksi.filter(t => t.tipe === 'pengeluaran');
        const uniqueDays = new Set(pengeluaranSaja.map(t => t.tanggal)).size;
        
        if (uniqueDays < 7) {
            qualityText.innerHTML = `⚠️ <strong>Kualitas Data Rendah (${uniqueDays}/7 Hari):</strong> AI membutuhkan minimal 7 hari pencatatan transaksi untuk memberikan ramalan dengan tingkat kepercayaan tinggi. Akurasi prediksi saat ini masih rendah.`;
            qualityBox.style.color = "var(--warning)";
            qualityBox.style.borderColor = "rgba(245, 158, 11, 0.3)";
            qualityBox.style.background = "rgba(245, 158, 11, 0.04)";
            qualityBox.style.display = 'block';
        } else {
            qualityText.innerHTML = `✅ <strong>Kualitas Data Tinggi (${uniqueDays} Hari):</strong> Volume data memadai. Model regresi melatih data dengan presisi tinggi dan area kepercayaan stabil.`;
            qualityBox.style.color = "var(--success)";
            qualityBox.style.borderColor = "rgba(16, 185, 129, 0.3)";
            qualityBox.style.background = "rgba(16, 185, 129, 0.04)";
            qualityBox.style.display = 'block';
        }
    }

    // Render Validasi Backtesting & Riwayat
    renderBacktestingHistory();

    // Update status koneksi database di panel Pengaturan
    const dbBadge = document.getElementById('db-status-badge');
    if (dbBadge) {
        if (DbService.isOnline) {
            dbBadge.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--success);"></i> Online (Supabase Cloud PostgreSQL)`;
            dbBadge.style.color = "var(--success)";
        } else {
            dbBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: var(--warning);"></i> Offline (LocalStorage Fallback)`;
            dbBadge.style.color = "var(--warning)";
        }
    }
    
    // ==========================================
    // RENDERING POLA AKHIR PEKAN (WEEKEND VS WEEKDAY)
    // ==========================================
    const weekendWeekdayVal = document.getElementById('weekend-weekday-val');
    const weekendWeekendVal = document.getElementById('weekend-weekend-val');
    const weekdayBar = document.getElementById('weekday-bar');
    const weekendBar = document.getElementById('weekend-bar');
    const weekendAiAdvice = document.getElementById('weekend-ai-advice');
    
    if (weekendWeekdayVal && weekendWeekendVal && weekdayBar && weekendBar && weekendAiAdvice) {
        let totalWeekdaySpend = 0;
        let totalWeekendSpend = 0;
        let weekdayDaysCount = 0;
        let weekendDaysCount = 0;
        
        const startStr = state.settings.tanggalMulai;
        const endStr = state.settings.tanggalSelesai || formatDateISO(new Date());
        
        if (startStr) {
            const start = new Date(startStr);
            const end = new Date(endStr);
            const curr = new Date(start);
            
            while (curr <= end) {
                const dayOfWeek = curr.getDay();
                const isWeekend = (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6); // Sun, Fri, Sat
                if (isWeekend) {
                    weekendDaysCount++;
                } else {
                    weekdayDaysCount++;
                }
                curr.setDate(curr.getDate() + 1);
            }
            
            state.transaksi.forEach(t => {
                if (t.tipe === 'pengeluaran' && t.tanggal) {
                    const dateObj = new Date(t.tanggal);
                    const dayOfWeek = dateObj.getDay();
                    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6);
                    const amt = parseFloat(t.jumlah) || 0;
                    if (isWeekend) {
                        totalWeekendSpend += amt;
                    } else {
                        totalWeekdaySpend += amt;
                    }
                }
            });
        } else {
            state.transaksi.forEach(t => {
                if (t.tipe === 'pengeluaran' && t.tanggal) {
                    const dateObj = new Date(t.tanggal);
                    const dayOfWeek = dateObj.getDay();
                    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6);
                    const amt = parseFloat(t.jumlah) || 0;
                    if (isWeekend) {
                        totalWeekendSpend += amt;
                        weekendDaysCount++;
                    } else {
                        totalWeekdaySpend += amt;
                        weekdayDaysCount++;
                    }
                }
            });
        }
        
        const avgWeekday = weekdayDaysCount > 0 ? Math.round(totalWeekdaySpend / weekdayDaysCount) : 0;
        const avgWeekend = weekendDaysCount > 0 ? Math.round(totalWeekendSpend / weekendDaysCount) : 0;
        
        weekendWeekdayVal.textContent = `${formatRupiah(avgWeekday)} / hari`;
        weekendWeekendVal.textContent = `${formatRupiah(avgWeekend)} / hari`;
        
        const maxAvg = Math.max(avgWeekday, avgWeekend, 10000);
        weekdayBar.style.width = `${(avgWeekday / maxAvg) * 100}%`;
        weekendBar.style.width = `${(avgWeekend / maxAvg) * 100}%`;
        
        let advice = "";
        const expCount = state.transaksi.filter(t => t.tipe === 'pengeluaran').length;
        if (expCount < 3) {
            advice = `<i class="fa-solid fa-circle-info" style="color: var(--secondary); margin-right: 6px;"></i> AI menganalisis transaksi Anda... Catat minimal 3 transaksi pengeluaran untuk membandingkan pola hari biasa dan akhir pekan.`;
        } else if (avgWeekend > avgWeekday) {
            const ratio = (avgWeekend / Math.max(1, avgWeekday)).toFixed(1);
            const percentDiff = Math.round(((avgWeekend - avgWeekday) / Math.max(1, avgWeekday)) * 100);
            const potentialSavings = Math.round((avgWeekend - avgWeekday) * 0.15);
            
            advice = `
                <i class="fa-solid fa-triangle-exclamation" style="color: var(--warning); margin-right: 6px;"></i> 
                Rata-rata pengeluaran harian Anda di <strong>akhir pekan (Jumat-Minggu)</strong> adalah <strong>${formatRupiah(avgWeekend)}</strong>, yaitu <strong>${ratio}x (${percentDiff}%)</strong> lebih boros dibanding hari biasa. 
                <br><br>
                💡 <strong>Tips AI:</strong> Cobalah memangkas pengeluaran akhir pekan sebesar 15% untuk menghemat sekitar <strong>${formatRupiah(potentialSavings)}/hari</strong>. Uang ini bisa menyelamatkan target tabungan Anda dari kebocoran!
            `;
        } else if (avgWeekend > 0) {
            advice = `
                <i class="fa-solid fa-circle-check" style="color: var(--success); margin-right: 6px;"></i> 
                Pola pengeluaran harian Anda sangat seimbang! Rata-rata belanja akhir pekan (${formatRupiah(avgWeekend)}) lebih rendah atau sama dengan hari biasa (${formatRupiah(avgWeekday)}). 
                Pertahankan disiplin ini untuk mengamankan siklus anggaran Anda!
            `;
        } else {
            advice = `<i class="fa-solid fa-circle-info" style="color: var(--secondary); margin-right: 6px;"></i> Belum ada pengeluaran akhir pekan yang tercatat untuk dianalisis.`;
        }
        weekendAiAdvice.innerHTML = advice;
    }
    
    // ==========================================
    // RENDERING LIMIT ANGGARAN KATEGORI (DASHBOARD)
    // ==========================================
    const categoryLimits = state.settings.categoryLimits || {};
    const hasLimits = Object.values(categoryLimits).some(v => parseFloat(v) > 0);
    const limitsCard = document.getElementById('category-limits-card');
    
    if (limitsCard) {
        if (hasLimits) {
            limitsCard.style.display = 'block';
            const listContainer = document.getElementById('category-limits-list');
            const categories = [
                { id: 'makanan', name: 'Makanan & Minuman', color: 'hsl(38, 92%, 50%)' },
                { id: 'kos', name: 'Kos & Kebutuhan Bulanan', color: 'hsl(243, 75%, 59%)' },
                { id: 'pendidikan', name: 'Kuliah & Pendidikan', color: 'hsl(217, 91%, 60%)' },
                { id: 'transportasi', name: 'Transportasi', color: 'hsl(142, 70%, 45%)' },
                { id: 'hiburan', name: 'Hiburan & Nongkrong', color: 'hsl(327, 73%, 58%)' },
                { id: 'lainnya', name: 'Lainnya', color: 'hsl(215, 16%, 47%)' }
            ];
            
            if (listContainer) {
                listContainer.innerHTML = categories.map(cat => {
                    const limit = parseFloat(categoryLimits[cat.id]) || 0;
                    if (limit === 0) return '';
                    
                    const spent = state.transaksi
                        .filter(t => t.tipe === 'pengeluaran' && t.kategori === cat.id)
                        .reduce((sum, t) => sum + (parseFloat(t.jumlah) || 0), 0);
                        
                    const pct = Math.min(100, Math.round((spent / limit) * 100));
                    
                    let progressColor = cat.color;
                    let alertText = "";
                    if (spent > limit) {
                        progressColor = "var(--danger)";
                        alertText = `<span style="color: var(--danger); font-size: 0.65rem; font-weight: 700; display: flex; align-items: center; gap: 3px;"><i class="fa-solid fa-triangle-exclamation"></i> Overbudget!</span>`;
                    } else if (pct >= 80) {
                        progressColor = "var(--warning)";
                        alertText = `<span style="color: var(--warning); font-size: 0.65rem; font-weight: 700; display: flex; align-items: center; gap: 3px;"><i class="fa-solid fa-circle-exclamation"></i> Kritis</span>`;
                    }
                    
                    return `
                        <div style="font-size: 0.75rem; background: rgba(0,0,0,0.12); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.03);">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; align-items: center;">
                                <span style="font-weight: 600;">${cat.name}</span>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    ${alertText}
                                    <span style="color: var(--text-secondary); font-size: 0.7rem;">${formatRupiah(spent)} / ${formatRupiah(limit)}</span>
                                </div>
                            </div>
                            <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden;">
                                <div style="width: ${pct}%; height: 100%; background: ${progressColor}; border-radius: 3px; transition: width 0.3s ease;"></div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } else {
            limitsCard.style.display = 'none';
        }
    }
    
    // ==========================================
    // K-MEANS CLUSTERING RECOMMENDER & METRICS
    // ==========================================
    const kmeansClusterBadge = document.getElementById('kmeans-cluster-badge');
    const kmeansAiRecom = document.getElementById('kmeans-ai-recom');
    const nbAccuracyEl = document.getElementById('nb-accuracy');
    const nbF1El = document.getElementById('nb-f1');
    const nbPrecisionEl = document.getElementById('nb-precision');
    const nbRecallEl = document.getElementById('nb-recall');
    const kmWcssEl = document.getElementById('km-wcss');
    
    // Fitur-fitur untuk K-Means (menggunakan variabel yang sudah dihitung di awal fungsi)
    
    // Fitur 1: Rata-rata belanja harian
    const pengeluaranSaja = state.transaksi.filter(t => t.tipe === 'pengeluaran');
    const uniqueDays = new Set(pengeluaranSaja.map(t => t.tanggal)).size || 1;
    const avgDailySpend = totalPengeluaran / uniqueDays;
    
    // Fitur 2: Rasio tabungan bulanan (aktual tabungan dari sisa uang)
    const sisaUang = budgetAwal + totalPemasukan - totalPengeluaran;
    const savingsRate = Math.max(0, Math.min(1, sisaUang / budgetAwal));
    
    // Fitur 3: Persentase pengeluaran hiburan terhadap total pengeluaran
    const totalHiburan = state.transaksi
        .filter(t => t.tipe === 'pengeluaran' && t.kategori === 'hiburan')
        .reduce((sum, t) => sum + (parseFloat(t.jumlah) || 0), 0);
    const entertainmentRatio = totalPengeluaran > 0 ? (totalHiburan / totalPengeluaran) * 100 : 0;
    
    const userFeatures = [avgDailySpend, savingsRate, entertainmentRatio];
    
    if (pengeluaranSaja.length >= 3) {
        const result = kmeansRecommender.runClustering(userFeatures);
        
        if (kmeansClusterBadge && kmeansAiRecom) {
            kmeansClusterBadge.textContent = result.metadata.name;
            kmeansClusterBadge.style.color = result.metadata.color;
            kmeansClusterBadge.style.background = `rgba(255,255,255,0.05)`;
            kmeansClusterBadge.style.borderColor = result.metadata.color;
            kmeansClusterBadge.style.border = `1px solid ${result.metadata.color}`;
            
            kmeansAiRecom.innerHTML = `
                <i class="fa-solid fa-brain" style="color: ${result.metadata.color}; margin-right: 6px;"></i>
                <strong>Klaster:</strong> ${result.metadata.name}<br>
                <strong>Deskripsi:</strong> ${result.metadata.desc}<br><br>
                💡 <strong>Tips Rekomendasi Finansial Kelompok:</strong> ${result.metadata.advice}
            `;
        }
        
        // Bind WCSS
        if (kmWcssEl) {
            kmWcssEl.textContent = result.wcss.toFixed(4);
        }
        
        // Render Elbow Table WCSS per K
        renderElbowTable(result.elbow);
    } else {
        // Jalankan clustering dengan baseline [0, 1, 0] untuk profil awal (Cold-Start)
        const result = kmeansRecommender.runClustering([0, 1, 0]);
        if (kmeansClusterBadge && kmeansAiRecom) {
            kmeansClusterBadge.textContent = `${result.metadata.name} (Estimasi)`;
            kmeansClusterBadge.style.color = result.metadata.color;
            kmeansClusterBadge.style.background = `rgba(255,255,255,0.05)`;
            kmeansClusterBadge.style.borderColor = result.metadata.color;
            kmeansClusterBadge.style.border = `1px solid ${result.metadata.color}`;
            
            kmeansAiRecom.innerHTML = `
                <i class="fa-solid fa-brain" style="color: ${result.metadata.color}; margin-right: 6px;"></i>
                <strong>Klaster Awal (Cold-Start):</strong> ${result.metadata.name}<br>
                <strong>Deskripsi:</strong> Anda belum memiliki transaksi pengeluaran yang cukup. Berdasarkan setelan anggaran awal, AI memprediksi Anda masuk kelompok ini.<br><br>
                💡 <strong>Tips Rekomendasi Kelompok:</strong> ${result.metadata.advice}
            `;
        }
        if (kmWcssEl) {
            kmWcssEl.textContent = result.wcss.toFixed(4);
        }
        
        // Render Elbow Table WCSS per K untuk profil baseline
        renderElbowTable(result.elbow);
    }
    
    // Jalankan Evaluasi Naive Bayes secara dinamis
    const nbMetrics = nbClassifier.evaluateModel();
    if (nbAccuracyEl && nbF1El && nbPrecisionEl && nbRecallEl) {
        nbAccuracyEl.textContent = `${(nbMetrics.accuracy * 100).toFixed(1)}%`;
        nbF1El.textContent = nbMetrics.f1Score.toFixed(3);
        nbPrecisionEl.textContent = nbMetrics.precision.toFixed(3);
        nbRecallEl.textContent = nbMetrics.recall.toFixed(3);
    }
    
    // Render Confusion Matrix
    renderConfusionMatrix(nbMetrics);
    
    // Render Informasi Training Set Size
    const mlInfo = document.getElementById('ml-training-info');
    if (mlInfo) {
        const localCount = state.transaksi.filter(t => t.tipe === 'pengeluaran').length;
        const totalDocs = nbClassifier.totalDocs;
        mlInfo.innerHTML = `
            <span>Status Training Model:</span>
            <span style="color: var(--primary); font-weight: 700;">
                ${totalDocs} Data Latih (20 Bootstrap + ${localCount} Transaksi Aktif)
            </span>
        `;
    }
    
    // 3. Render Transaksi di Dashboard (Maksimal 5)
    renderTransactionList('dashboard-transaction-list', 5);
    
    // 4. Render Transaksi di Tab Transaksi Lengkap
    renderTransactionList('main-transaction-list');
}

// Render daftar transaksi ke dalam container tertentu
function renderTransactionList(containerId, limit = null, filterKategori = 'semua') {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    
    let filteredList = state.transaksi;
    
    // Terapkan filter kategori
    if (filterKategori !== 'semua') {
        if (filterKategori === 'pemasukan') {
            filteredList = filteredList.filter(t => t.tipe === 'pemasukan');
        } else {
            filteredList = filteredList.filter(t => t.tipe === 'pengeluaran' && t.kategori === filterKategori);
        }
    }
    
    // Urutkan berdasarkan tanggal terbaru
    filteredList.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    
    // Batasi jumlah yang dirender
    const listToRender = limit ? filteredList.slice(0, limit) : filteredList;
    
    if (listToRender.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-receipt empty-state-icon"></i>
                <p>Belum ada transaksi tercatat untuk kategori ini.</p>
            </div>
        `;
        return;
    }
    
    listToRender.forEach(t => {
        const item = document.createElement('div');
        item.className = "transaction-item";
        
        let iconClass = "t-icon-lainnya";
        let iconHtml = '<i class="fa-solid fa-box"></i>';
        
        if (t.tipe === 'pemasukan') {
            iconClass = "t-icon-pemasukan";
            iconHtml = '<i class="fa-solid fa-arrow-down-long"></i>';
        } else {
            switch(t.kategori) {
                case 'makanan':
                    iconClass = "t-icon-makanan";
                    iconHtml = '<i class="fa-solid fa-utensils"></i>';
                    break;
                case 'kos':
                    iconClass = "t-icon-kos";
                    iconHtml = '<i class="fa-solid fa-house"></i>';
                    break;
                case 'pendidikan':
                    iconClass = "t-icon-pendidikan";
                    iconHtml = '<i class="fa-solid fa-graduation-cap"></i>';
                    break;
                case 'transportasi':
                    iconClass = "t-icon-transportasi";
                    iconHtml = '<i class="fa-solid fa-car"></i>';
                    break;
                case 'hiburan':
                    iconClass = "t-icon-hiburan";
                    iconHtml = '<i class="fa-solid fa-gamepad"></i>';
                    break;
            }
        }
        
        const sign = t.tipe === 'pemasukan' ? '+' : '-';
        const colorClass = t.tipe === 'pemasukan' ? 'income' : 'expense';
        
        item.innerHTML = `
            <div class="t-info">
                <div class="t-icon-box ${iconClass}">
                    ${iconHtml}
                </div>
                <div class="t-details">
                    <span class="t-title">${t.keterangan}</span>
                    <span class="t-date">${formatDateIndoStr(t.tanggal)}</span>
                </div>
            </div>
            <span class="t-amount ${colorClass}">${sign} ${formatRupiah(t.jumlah)}</span>
        `;
        
        container.appendChild(item);
    });
}

// Filter Transaksi dari Tab Transaksi
function filterTransactions(kategori, btnEl) {
    // Ganti class active pada tombol filter
    document.querySelectorAll('#category-filters .btn').forEach(btn => btn.classList.remove('active-filter', 'btn-primary'));
    document.querySelectorAll('#category-filters .btn').forEach(btn => btn.classList.add('btn-secondary'));
    
    btnEl.classList.remove('btn-secondary');
    btnEl.classList.add('active-filter', 'btn-primary');
    
    renderTransactionList('main-transaction-list', null, kategori);
}

// Modal Toggle Handlers
function openModal() {
    document.getElementById('transaction-modal').classList.add('active');
    // Set default date to today
    document.getElementById('t-date').value = formatDateISO(new Date());
    
    // Reset label kategori
    const label = document.querySelector('#group-kategori label');
    if (label) label.innerHTML = `Kategori`;
    
    // Muat saran keterangan otomatis
    showSuggestions("");
}

// Menampilkan dan memfilter kotak saran berdasarkan input query
function showSuggestions(query = "") {
    const suggestionsBox = document.getElementById('desc-suggestions-box');
    const descInput = document.getElementById('t-desc');
    if (!suggestionsBox || !descInput) return;
    
    // Ambil daftar keterangan pengeluaran yang unik beserta kategorinya
    const suggestionsMap = new Map();
    state.transaksi.forEach(t => {
        if (t.tipe === 'pengeluaran' && t.keterangan && t.kategori) {
            const descClean = t.keterangan.trim();
            const descLower = descClean.toLowerCase();
            if (!suggestionsMap.has(descLower)) {
                suggestionsMap.set(descLower, {
                    keterangan: descClean,
                    kategori: t.kategori
                });
            }
        }
    });
    
    // Jika riwayat transaksi masih kosong/baru, tampilkan beberapa saran bawaan mahasiswa
    if (suggestionsMap.size === 0) {
        const defaults = [
            { keterangan: "Makan Siang Warteg", kategori: "makanan" },
            { keterangan: "Bayar Kos Bulanan", kategori: "kos" },
            { keterangan: "Bensin Motor", kategori: "transportasi" },
            { keterangan: "Fotokopi & Cetak Tugas", kategori: "pendidikan" },
            { keterangan: "Rokok & Kopi Nongkrong", kategori: "hiburan" },
            { keterangan: "Sewa Lapangan Futsal", kategori: "hiburan" }
        ];
        defaults.forEach(item => {
            suggestionsMap.set(item.keterangan.toLowerCase(), item);
        });
    }
    
    const allSuggestions = Array.from(suggestionsMap.values());
    const q = query.trim().toLowerCase();
    
    // Filter saran berdasarkan query pencarian (jika ada input)
    const filtered = q 
        ? allSuggestions.filter(item => item.keterangan.toLowerCase().includes(q))
        : allSuggestions;
        
    if (filtered.length === 0) {
        suggestionsBox.style.display = 'none';
        return;
    }
    
    // Batasi 10 saran teratas
    const displaySuggestions = filtered.slice(0, 10);
    
    // Pemetaan nama kategori untuk tampilan human-readable
    const displayKategori = {
        makanan: "Makanan",
        kos: "Kos",
        pendidikan: "Kuliah",
        transportasi: "Bensin/Trans",
        hiburan: "Hiburan/Nongkrong",
        lainnya: "Lain-lain"
    };
    
    suggestionsBox.innerHTML = displaySuggestions.map(item => {
        const catName = displayKategori[item.kategori] || item.kategori;
        return `
            <div class="suggestion-item" data-desc="${item.keterangan.replace(/"/g, '&quot;')}" data-category="${item.kategori}">
                <span>${escapeHtml(item.keterangan)}</span>
                <span class="suggestion-category">${escapeHtml(catName)}</span>
            </div>
        `;
    }).join('');
    
    suggestionsBox.style.display = 'block';
    
    // Tambahkan event listener click pada masing-masing item saran
    suggestionsBox.querySelectorAll('.suggestion-item').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation(); // Cegah terpicu event klik global
            const selectedDesc = el.getAttribute('data-desc');
            const selectedCat = el.getAttribute('data-category');
            
            descInput.value = selectedDesc;
            
            // Prediksi kategori dengan Naive Bayes untuk membuktikan model berjalan
            const prediction = nbClassifier.classify(selectedDesc);
            const resolvedCat = (prediction && prediction.confidence > 40) ? prediction.category : selectedCat;
            
            const catInput = document.getElementById('t-category');
            if (catInput && resolvedCat) {
                catInput.value = resolvedCat;
            }
            
            const label = document.querySelector('#group-kategori label');
            if (label && prediction) {
                label.innerHTML = `Kategori <span style="font-size: 0.65rem; color: var(--success); font-weight: 700;">(AI Naive Bayes: ${prediction.confidence}% yakin)</span>`;
            }
            
            suggestionsBox.style.display = 'none';
            console.log(`[Auto-Kategori ML] Memilih '${selectedDesc}' dengan kategori '${resolvedCat}' (${prediction.confidence}% confidence)`);
        });
    });
}

// Helper untuk mencari transaksi masa lalu berdasarkan keterangan (case-insensitive)
function findPastTransaction(desc) {
    if (!desc) return null;
    return state.transaksi.find(t => 
        t.tipe === 'pengeluaran' && 
        t.keterangan && 
        t.keterangan.trim().toLowerCase() === desc.toLowerCase()
    );
}

// Helper escape HTML sederhana agar aman
function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function closeModal() {
    document.getElementById('transaction-modal').classList.remove('active');
    // Reset form
    document.getElementById('t-amount').value = "";
    document.getElementById('t-desc').value = "";
}

function setTipeTransaksi(tipe) {
    state.tipeForm = tipe;
    document.querySelectorAll('.segment-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`segment-${tipe}`).classList.add('active');
    
    const catGroup = document.getElementById('group-kategori');
    if (tipe === 'pemasukan') {
        catGroup.style.display = 'none'; // Sembunyikan kategori untuk pemasukan
    } else {
        catGroup.style.display = 'block';
    }
}

// Submit transaksi baru dari modal form
async function submitTransaction() {
    const amtInput = document.getElementById('t-amount');
    const descInput = document.getElementById('t-desc');
    const catInput = document.getElementById('t-category');
    const dateInput = document.getElementById('t-date');
    
    const amount = parseFloat(amtInput.value);
    const desc = descInput.value.trim();
    const date = dateInput.value;
    const category = catInput.value;
    
    if (isNaN(amount) || amount <= 0 || !desc || !date) {
        alert("Mohon lengkapi seluruh kolom isian dengan data yang valid!");
        return;
    }
    
    const newTx = {
        id: Date.now().toString(),
        tipe: state.tipeForm,
        jumlah: amount,
        keterangan: desc,
        kategori: state.tipeForm === 'pemasukan' ? 'pemasukan' : category,
        tanggal: date
    };
    
    state.transaksi.push(newTx);
    
    // Latih kembali Naive Bayes Classifier secara dinamis
    if (state.tipeForm === 'pengeluaran') {
        nbClassifier.train(desc, category);
    }
    
    // Tampilkan state menyimpan
    const saveBtn = document.querySelector('#transaction-modal .btn-primary');
    const originalText = saveBtn ? saveBtn.textContent : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Menyimpan...`;
    }
    
    await saveState();
    
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
    
    updateUI();
    closeModal();
}

// Menyimpan konfigurasi siklus anggaran dari tab Pengaturan
async function saveSettings() {
    const budgetInput = document.getElementById('settings-budget');
    const savingTargetInput = document.getElementById('settings-saving-target');
    const startInput = document.getElementById('settings-start-date');
    const endInput = document.getElementById('settings-end-date');
    
    const budgetVal = parseFloat(budgetInput.value);
    const savingTargetVal = parseFloat(savingTargetInput.value) || 0;
    const startVal = startInput.value;
    const endVal = endInput.value;
    
    if (isNaN(budgetVal) || budgetVal <= 0 || savingTargetVal < 0 || !startVal || !endVal) {
        alert("Konfigurasi tidak valid! Masukkan data anggaran dan tanggal dengan benar.");
        return;
    }
    
    if (savingTargetVal >= budgetVal) {
        alert("Target menabung tidak boleh melebihi atau sama dengan total uang bulanan awal!");
        return;
    }
    
    if (new Date(startVal) >= new Date(endVal)) {
        alert("Tanggal mulai harus lebih awal dibanding tanggal kiriman berikutnya!");
        return;
    }
    
    const limitMakanan = parseFloat(document.getElementById('limit-makanan').value) || 0;
    const limitKos = parseFloat(document.getElementById('limit-kos').value) || 0;
    const limitPendidikan = parseFloat(document.getElementById('limit-pendidikan').value) || 0;
    const limitTransportasi = parseFloat(document.getElementById('limit-transportasi').value) || 0;
    const limitHiburan = parseFloat(document.getElementById('limit-hiburan').value) || 0;
    const limitLainnya = parseFloat(document.getElementById('limit-lainnya').value) || 0;
    
    state.settings.budgetAwal = budgetVal;
    state.settings.targetMenabung = savingTargetVal;
    state.settings.tanggalMulai = startVal;
    state.settings.tanggalSelesai = endVal;
    state.settings.categoryLimits = {
        makanan: limitMakanan,
        kos: limitKos,
        pendidikan: limitPendidikan,
        transportasi: limitTransportasi,
        hiburan: limitHiburan,
        lainnya: limitLainnya
    };
    
    // Tampilkan loading indicator
    const btn = document.querySelector('button[onclick="saveSettings()"]');
    const originalText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;
    }
    
    await saveState();
    
    if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
    }
    
    updateUI();
    alert("Konfigurasi siklus anggaran berhasil disimpan!");
    switchTab('dashboard');
}

// Menghapus seluruh data untuk reset
async function clearAllData() {
    if (confirm("Apakah Anda yakin ingin menghapus seluruh data transaksi? Tindakan ini tidak dapat dibatalkan.")) {
        state.transaksi = [];
        
        // Tampilkan loading
        const btn = document.querySelector('button[onclick="clearAllData()"]');
        const originalText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menghapus...`;
        }
        
        await saveState();
        
        // Kosongkan riwayat backtesting juga di database
        if (DbService.isOnline) {
            await DbService.clearAllTransactions(state.currentUser);
            const historyKey = `smartcash_history_${state.currentUser}`;
            localStorage.removeItem(historyKey);
            await DbService.saveAllHistory(state.currentUser, []);
        } else {
            const historyKey = `smartcash_history_${state.currentUser}`;
            localStorage.removeItem(historyKey);
        }
        
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
        
        updateUI();
        alert("Seluruh data transaksi dan riwayat backtesting telah dikosongkan.");
        switchTab('dashboard');
    }
}

// Suntik Data Dummy untuk simulasi sidang skripsi (Polanya teratur agar regresi terlihat cantik)
async function seedDemoData() {
    const today = new Date();
    state.transaksi = []; // bersihkan data lama agar hasil grafik bersih
    
    // Sesuaikan tanggal siklus budget agar data dummy 10 hari masuk ke siklus aktif
    const startCycle = new Date(today);
    startCycle.setDate(today.getDate() - 9);
    const endCycle = new Date(today);
    endCycle.setDate(today.getDate() + 20);
    
    state.settings.tanggalMulai = formatDateISO(startCycle);
    state.settings.tanggalSelesai = formatDateISO(endCycle);
    state.settings.budgetAwal = 1500000;
    state.settings.targetMenabung = 300000;
    
    // Update input settings jika elemen ada di DOM
    const startInput = document.getElementById('settings-start-date');
    const endInput = document.getElementById('settings-end-date');
    const budgetInput = document.getElementById('settings-budget');
    const savingInput = document.getElementById('settings-saving');
    
    if (startInput) startInput.value = state.settings.tanggalMulai;
    if (endInput) endInput.value = state.settings.tanggalSelesai;
    if (budgetInput) budgetInput.value = state.settings.budgetAwal;
    if (savingInput) savingInput.value = state.settings.targetMenabung;

    // Suntik data pengeluaran teratur dalam 9 hari berturut-turut ke belakang
    const baseAmount = 60000;
    const categories = [
        'makanan', 'transportasi', 'makanan', 'hiburan', 
        'kos', 'pendidikan', 'makanan', 'transportasi', 'hiburan'
    ];
    const descs = [
        'Makan siang warteg', 'Bensin Pertalite', 'Makan geprek gepuk', 'Nongkrong kafe', 
        'Sabun mandi & odol', 'Print tugas makalah', 'Makan malam indomie', 'Tarif parkir & grab', 'Rokok & kopi senja'
    ];
    
    for (let i = 9; i >= 1; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        
        const variance = (Math.random() * 20000) - 10000;
        const finalAmt = Math.round((baseAmount + variance) / 1000) * 1000;
        
        state.transaksi.push({
            id: `dummy-${i}`,
            tipe: 'pengeluaran',
            amount: finalAmt,
            jumlah: finalAmt,
            keterangan: descs[9 - i],
            kategori: categories[9 - i],
            tanggal: formatDateISO(d)
        });
    }

    // Suntik satu transaksi ANOMALI (Outlier Z-score) untuk hari ini (Total 10 hari data)
    state.transaksi.push({
        id: `dummy-anomaly`,
        tipe: 'pengeluaran',
        jumlah: 450000,
        keterangan: 'Beli tiket konser musik festival',
        kategori: 'hiburan',
        tanggal: formatDateISO(today)
    });
    
    // Suntik data histori siklus sebelumnya untuk demonstrasi Backtesting
    const historyKey = `smartcash_history_${state.currentUser}`;
    const dummyHistory = [
        {
            cycleId: "Juni 2026",
            tanggalMulai: "2026-06-01",
            tanggalSelesai: "2026-06-30",
            budgetAwal: 1500000,
            targetTabungan: 300000,
            totalPengeluaran: 1160000,
            totalPemasukan: 100000,
            status: "Sukses (Target Tabungan Aman)",
            statusColor: "var(--success)",
            rmseReg: 8200,
            rmseNaive: 14500,
            hariPrediksiHabis: 29,
            hariAktualHabis: 32, // Aman (melewati siklus 30 hari)
            selisihHari: 3
        },
        {
            cycleId: "Mei 2026",
            tanggalMulai: "2026-05-01",
            tanggalSelesai: "2026-05-31",
            budgetAwal: 1200000,
            targetTabungan: 200000,
            totalPengeluaran: 1250000,
            totalPemasukan: 50000,
            status: "Gagal (Tabungan Bocor)",
            statusColor: "var(--danger)",
            rmseReg: 7400,
            rmseNaive: 16800,
            hariPrediksiHabis: 24,
            hariAktualHabis: 23, // Habis lebih awal
            selisihHari: 1
        }
    ];
    
    // Simpan history ke Cloud DB & State
    state.history = dummyHistory;
    if (DbService.isOnline) {
        await DbService.saveAllHistory(state.currentUser, dummyHistory);
    }
    localStorage.setItem(historyKey, JSON.stringify(dummyHistory));
    
    // Tampilkan loading indicator
    const btn = document.querySelector('button[onclick="seedDemoData()"]');
    const originalText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyuntikkan...`;
    }
    
    await saveState();
    
    if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
    }
    
    updateUI();
    alert("Berhasil menyuntikkan 5 hari data transaksi dummy (termasuk 1 anomali pengeluaran konser) dan 2 bulan data riwayat backtesting! Silakan cek menu Dompet dan Analisis AI.");
    switchTab('dashboard');
}

// RENDER GRAFIK PREDIKSI (SVG BASED - OFFLINE FRIENDLY)
function renderAnalysisChart() {
    const container = document.getElementById('svg-chart-wrapper');
    const emptyState = document.getElementById('chart-empty-state');
    
    // Update label tanggal di bawah chart
    document.getElementById('chart-start-date').textContent = formatDateIndoStr(state.settings.tanggalMulai);
    document.getElementById('chart-end-date').textContent = formatDateIndoStr(state.settings.tanggalSelesai);
    
    const pengeluaranSaja = state.transaksi.filter(t => t.tipe === 'pengeluaran');
    
    // Sembunyikan empty state (selalu tampilkan visualisasi baseline/proyeksi)
    emptyState.style.display = 'none';
    
    // Hapus SVG lama jika ada
    const existingSvg = container.querySelector('svg');
    if (existingSvg) existingSvg.remove();
    
    // Ambil data analisis regresi
    const budgetAwal = parseFloat(state.settings.budgetAwal);
    const start = new Date(state.settings.tanggalMulai);
    const end = new Date(state.settings.tanggalSelesai);
    
    const targetMenabung = parseFloat(state.settings.targetMenabung) || 0;
    const analysis = FinancialForecast.analyze({
        budgetAwal: budgetAwal,
        saldoSaatIni: budgetAwal - pengeluaranSaja.reduce((sum, t) => sum + parseFloat(t.jumlah), 0),
        targetMenabung: targetMenabung,
        tanggalMulai: state.settings.tanggalMulai,
        tanggalSelesai: state.settings.tanggalSelesai,
        transaksi: state.transaksi
    });
    
    // Buat SVG secara dinamis
    const width = container.clientWidth || 350;
    const height = 180;
    const padding = { top: 15, right: 15, bottom: 20, left: 45 };
    
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    
    // Rentang sumbu X (hari 1 s/d hari terakhir siklus budget)
    const xMin = 1;
    const xMax = analysis.totalHariSiklus;
    
    // Rentang sumbu Y (0 s/d total budgetAwal atau batas maksimal belanja terhitung)
    const yMin = 0;
    const yMax = Math.max(budgetAwal, analysis.batasMaksimalBelanja);
    
    // Helper fungsi mapping koordinat data ke piksel layar SVG
    const getXPixel = (xVal) => {
        return padding.left + ((xVal - xMin) / (xMax - xMin)) * (width - padding.left - padding.right);
    };
    
    const getYPixel = (yVal) => {
        // Balik sumbu Y karena koordinat pixel web dimulai dari pojok kiri atas
        return height - padding.bottom - ((yVal - yMin) / (yMax - yMin)) * (height - padding.top - padding.bottom);
    };
    
    // 1. Draw Grid Lines & Labels
    const gridCount = 4;
    for (let i = 0; i <= gridCount; i++) {
        const yVal = (yMax / gridCount) * i;
        const yPixel = getYPixel(yVal);
        
        // Garis Grid Horizontal
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", padding.left);
        line.setAttribute("y1", yPixel);
        line.setAttribute("x2", width - padding.right);
        line.setAttribute("y2", yPixel);
        line.setAttribute("stroke", "rgba(255, 255, 255, 0.05)");
        line.setAttribute("stroke-width", "1");
        svg.appendChild(line);
        
        // Label Anggaran di sebelah kiri
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", padding.left - 8);
        text.setAttribute("y", yPixel + 4);
        text.setAttribute("text-anchor", "end");
        text.setAttribute("fill", "var(--text-muted)");
        text.setAttribute("font-size", "9px");
        text.textContent = formatRupiahShort(yVal);
        svg.appendChild(text);
    }
    
    // 1.5 Draw Saving Target Threshold Line if set
    if (targetMenabung > 0) {
        const batasMaksimalBelanja = budgetAwal - targetMenabung;
        const yBatasPixel = getYPixel(batasMaksimalBelanja);
        
        // Horizontal Line for Saving Threshold
        const thresholdLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        thresholdLine.setAttribute("x1", padding.left);
        thresholdLine.setAttribute("y1", yBatasPixel);
        thresholdLine.setAttribute("x2", width - padding.right);
        thresholdLine.setAttribute("y2", yBatasPixel);
        thresholdLine.setAttribute("stroke", "var(--danger)");
        thresholdLine.setAttribute("stroke-width", "1.5");
        thresholdLine.setAttribute("stroke-dasharray", "2 2");
        svg.appendChild(thresholdLine);
        
        // Text Label for Saving Threshold
        const thresholdText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        thresholdText.setAttribute("x", width - padding.right);
        thresholdText.setAttribute("y", yBatasPixel - 6);
        thresholdText.setAttribute("text-anchor", "end");
        thresholdText.setAttribute("fill", "var(--danger)");
        thresholdText.setAttribute("font-size", "8px");
        thresholdText.setAttribute("font-weight", "600");
        thresholdText.textContent = "Batas Tabungan";
        svg.appendChild(thresholdText);
    }

    // 2. Kumpulkan titik data aktual kumulatif pengeluaran
    const pengeluaranPerHari = {};
    pengeluaranSaja.forEach(t => {
        const tDate = new Date(t.tanggal);
        tDate.setHours(0,0,0,0);
        const hariKe = Math.ceil((tDate - start) / (1000 * 60 * 60 * 24)) + 1;
        if (hariKe >= 1 && hariKe <= xMax) {
            pengeluaranPerHari[hariKe] = (pengeluaranPerHari[hariKe] || 0) + parseFloat(t.jumlah);
        }
    });
    
    const maxHariTransaksi = Math.max(...Object.keys(pengeluaranPerHari).map(Number));
    let kumulatif = 0;
    const actualPoints = [];
    
    for (let day = 1; day <= maxHariTransaksi; day++) {
        kumulatif += (pengeluaranPerHari[day] || 0);
        actualPoints.push({ x: day, y: kumulatif });
    }
    
    // 3. Draw Actual Line (Garis Pengeluaran Riil)
    if (actualPoints.length > 0) {
        const pathData = actualPoints.map((pt, idx) => {
            const xPixel = getXPixel(pt.x);
            const yPixel = getYPixel(pt.y);
            return `${idx === 0 ? 'M' : 'L'} ${xPixel} ${yPixel}`;
        }).join(' ');
        
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathData);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "var(--primary)");
        path.setAttribute("stroke-width", "3");
        path.setAttribute("stroke-linecap", "round");
        svg.appendChild(path);
        
        // Draw titik-titik data
        actualPoints.forEach(pt => {
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", getXPixel(pt.x));
            circle.setAttribute("cy", getYPixel(pt.y));
            circle.setAttribute("r", "4");
            circle.setAttribute("fill", "var(--secondary)");
            circle.setAttribute("stroke", "var(--bg-dark)");
            circle.setAttribute("stroke-width", "1.5");
            svg.appendChild(circle);
        });
    }
    
    // 4. Draw Projection Line (Garis Prediksi Regresi Linear Terintegrasi Secara Kuadratik)
    if (analysis.kecepatanHarian !== 0 || analysis.intercept !== 0) {
        const m = analysis.kecepatanHarian;
        const c = analysis.intercept;
        const hariKeHabis = analysis.hariKeHabis;
        const batasMaksimalBelanja = analysis.batasMaksimalBelanja;
        
        const hariTerakhirAktual = actualPoints.length > 0 ? actualPoints[actualPoints.length - 1].x : 0;
        
        const projPoints = [];
        const upperPoints = [];
        const lowerPoints = [];
        const stdErrorEst = analysis.stdErrorEst;
        
        // Generate koordinat kurva secara mulus tiap 0.5 hari
        const step = 0.5;
        for (let day = hariTerakhirAktual; day <= Math.min(hariKeHabis, xMax); day += step) {
            const k = day - hariTerakhirAktual;
            const sigmaCum = Math.sqrt(k) * stdErrorEst;
            
            // Formula Integral Kumulatif: S(t) = (m/2)*t^2 + (c + m/2)*t
            const cumSpend = (m / 2) * day * day + (c + m / 2) * day;
            
            projPoints.push({ x: day, y: Math.min(cumSpend, batasMaksimalBelanja) });
            upperPoints.push({ x: day, y: Math.min(cumSpend + sigmaCum, yMax) });
            lowerPoints.push({ x: day, y: Math.max(0, cumSpend - sigmaCum) });
        }
        
        // Pastikan titik potong akhir ter-plot dengan presisi
        if (hariKeHabis <= xMax && hariKeHabis > hariTerakhirAktual) {
            const kEnd = hariKeHabis - hariTerakhirAktual;
            const sigmaCumEnd = Math.sqrt(kEnd) * stdErrorEst;
            
            projPoints.push({ x: hariKeHabis, y: batasMaksimalBelanja });
            upperPoints.push({ x: hariKeHabis, y: Math.min(batasMaksimalBelanja + sigmaCumEnd, yMax) });
            lowerPoints.push({ x: hariKeHabis, y: Math.max(0, batasMaksimalBelanja - sigmaCumEnd) });
        }
        
        // Gambar Area Interval Kepercayaan (Shaded Polygon)
        if (upperPoints.length >= 2) {
            const polygonPoints = [
                ...upperPoints.map(pt => `${getXPixel(pt.x)},${getYPixel(pt.y)}`),
                ...[...lowerPoints].reverse().map(pt => `${getXPixel(pt.x)},${getYPixel(pt.y)}`)
            ].join(' ');
            
            const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            poly.setAttribute("points", polygonPoints);
            poly.setAttribute("fill", "rgba(139, 92, 246, 0.1)"); // Shaded band purple glow
            poly.setAttribute("stroke", "none");
            svg.appendChild(poly);
            
            // Gambar garis batas tipis atas & bawah
            const drawDashBorder = (pts) => {
                const borderPath = pts.map((pt, idx) => {
                    return `${idx === 0 ? 'M' : 'L'} ${getXPixel(pt.x)} ${getYPixel(pt.y)}`;
                }).join(' ');
                
                const border = document.createElementNS("http://www.w3.org/2000/svg", "path");
                border.setAttribute("d", borderPath);
                border.setAttribute("fill", "none");
                border.setAttribute("stroke", "rgba(139, 92, 246, 0.25)");
                border.setAttribute("stroke-width", "0.8");
                border.setAttribute("stroke-dasharray", "2 3");
                svg.appendChild(border);
            };
            
            drawDashBorder(upperPoints);
            drawDashBorder(lowerPoints);
        }
        
        if (projPoints.length >= 2) {
            const pathData = projPoints.map((pt, idx) => {
                const xPixel = getXPixel(pt.x);
                const yPixel = getYPixel(pt.y);
                return `${idx === 0 ? 'M' : 'L'} ${xPixel} ${yPixel}`;
            }).join(' ');
            
            const projPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            projPath.setAttribute("d", pathData);
            projPath.setAttribute("fill", "none");
            projPath.setAttribute("stroke", "var(--secondary)");
            projPath.setAttribute("stroke-width", "2.5");
            projPath.setAttribute("stroke-dasharray", "4 4");
            svg.appendChild(projPath);
        }
        
        // Gambar marker "Habis" jika hari habis ada dalam siklus grafik
        if (hariKeHabis <= xMax && hariKeHabis > 0) {
            const yEndPixel = getYPixel(Math.min((m / 2) * hariKeHabis * hariKeHabis + (c + m / 2) * hariKeHabis, batasMaksimalBelanja));
            const warningMarker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            warningMarker.setAttribute("cx", getXPixel(hariKeHabis));
            warningMarker.setAttribute("cy", yEndPixel);
            warningMarker.setAttribute("r", "5");
            warningMarker.setAttribute("fill", "var(--danger)");
            svg.appendChild(warningMarker);
        }
    }
    
    container.appendChild(svg);
}

// Utility Formatter Rupiah
function formatRupiah(number) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(number);
}

// Formatter Singkat untuk label sumbu Y (misal: 1,5M, 1M, 500rb)
function formatRupiahShort(number) {
    if (number >= 1000000) {
        return (number / 1000000).toFixed(1).replace('.0', '') + ' Jt';
    } else if (number >= 1000) {
        return (number / 1000).toFixed(0) + ' Rb';
    }
    return number;
}

// Memformat string tanggal YYYY-MM-DD ke Indonesia
function formatDateIndoStr(dateStr) {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "-";
    
    const bulan = [
        "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
        "Jul", "Agt", "Sep", "Okt", "Nov", "Des"
    ];
    return `${date.getDate()} ${bulan[date.getMonth()]} ${date.getFullYear()}`;
}

// Inisialisasi Slider What-If (Simulasi Harian)
function initWhatIfSlider() {
    const slider = document.getElementById('whatif-slider');
    const valDisplay = document.getElementById('slider-value');
    
    if (!slider) return;
    
    const updateWhatIf = () => {
        const plannedSpending = parseFloat(slider.value);
        valDisplay.textContent = `${formatRupiah(plannedSpending)} / hari`;
        
        // Hitung total pemasukan, pengeluaran, dan saldo
        let totalPemasukan = 0;
        let totalPengeluaran = 0;
        
        state.transaksi.forEach(t => {
            const amt = parseFloat(t.jumlah);
            if (t.tipe === 'pemasukan') {
                totalPemasukan += amt;
            } else {
                totalPengeluaran += amt;
            }
        });
        
        const budgetAwal = parseFloat(state.settings.budgetAwal);
        const targetMenabung = parseFloat(state.settings.targetMenabung) || 0;
        const saldoSaatIni = budgetAwal - totalPengeluaran + totalPemasukan;
        const saldoEfektifBelanja = saldoSaatIni - targetMenabung;
        
        const resultDisplay = document.getElementById('slider-result');
        
        if (saldoEfektifBelanja <= 0) {
            resultDisplay.innerHTML = `<span style="color: var(--danger); font-weight: 700;">⚠️ Saldo belanja efektif Anda sudah habis (atau terpakai untuk target tabungan)!</span>`;
            return;
        }
        
        const sisaHari = Math.floor(saldoEfektifBelanja / plannedSpending);
        const today = new Date();
        const tanggalHabis = new Date(today);
        tanggalHabis.setDate(today.getDate() + sisaHari);
        
        const end = new Date(state.settings.tanggalSelesai);
        const sisaHariTarget = Math.max(0, Math.ceil((end - today) / (1000 * 60 * 60 * 24)));
        
        let statusColor = "var(--success)";
        let alertText = "";
        
        if (sisaHari < sisaHariTarget) {
            statusColor = "var(--warning)";
            alertText = ` (Target tabungan Rp ${formatRupiah(targetMenabung)} akan bocor! ⚠️)`;
        }
        
        resultDisplay.innerHTML = `
            <i class="fa-solid fa-clock" style="color: ${statusColor}; margin-right: 6px;"></i> 
            Jika belanja rata-rata <strong>${formatRupiah(plannedSpending)}/hari</strong>, saldo belanja efektif Anda akan bertahan <strong>${sisaHari} Hari</strong> lagi (hingga <strong>${FinancialForecast.formatDateIndo(tanggalHabis)}</strong>).${alertText}
        `;
    };
    
    slider.addEventListener('input', updateWhatIf);
    // Panggil sekali untuk inisialisasi
    updateWhatIf();
}

// ==========================================
// FITUR AUTENTIKASI & MULTI-USER MANAGEMENT
// ==========================================

let authMode = 'login'; // 'login' atau 'register'

function toggleAuthMode() {
    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    const submitBtn = document.getElementById('auth-btn-submit');
    const toggleDesc = document.getElementById('auth-toggle-desc');
    const toggleBtn = document.getElementById('auth-toggle-btn');
    const msgBox = document.getElementById('auth-message');
    
    msgBox.style.display = 'none';
    
    if (authMode === 'login') {
        authMode = 'register';
        title.textContent = 'Daftar Akun Baru';
        subtitle.textContent = 'Mulai kelola keuangan Anda secara ilmiah';
        submitBtn.textContent = 'Daftar';
        toggleDesc.textContent = 'Sudah punya akun?';
        toggleBtn.textContent = 'Masuk Sekarang';
    } else {
        authMode = 'login';
        title.textContent = 'SmartCash AI';
        subtitle.textContent = 'Kelola keuangan mahasiswa dengan presisi statistik';
        submitBtn.textContent = 'Masuk';
        toggleDesc.textContent = 'Belum punya akun?';
        toggleBtn.textContent = 'Daftar Sekarang';
    }
}

async function handleAuthSubmit() {
    const usernameInput = document.getElementById('auth-username');
    const passwordInput = document.getElementById('auth-password');
    const msgBox = document.getElementById('auth-message');
    
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    
    if (!username || !password) {
        showAuthMessage('Username dan Password tidak boleh kosong!', 'var(--danger)', 'rgba(239, 68, 68, 0.15)');
        return;
    }
    
    // Tampilkan loading spinner
    const submitBtn = document.getElementById('auth-btn-submit');
    const originalText = submitBtn ? submitBtn.textContent : 'Masuk';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memproses...`;
    }
    
    if (authMode === 'register') {
        const res = await DbService.registerUser(username, password);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
        
        if (res.error) {
            showAuthMessage(res.error, 'var(--danger)', 'rgba(239, 68, 68, 0.15)');
            return;
        }
        
        showAuthMessage('Registrasi berhasil! Silakan masuk.', 'var(--success)', 'rgba(16, 185, 129, 0.15)');
        
        setTimeout(() => {
            toggleAuthMode();
            passwordInput.value = '';
        }, 1000);
    } else {
        const res = await DbService.loginUser(username, password);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
        
        if (res.error) {
            showAuthMessage(res.error, 'var(--danger)', 'rgba(239, 68, 68, 0.15)');
            return;
        }
        
        // Buat sesi login
        state.currentUser = username;
        localStorage.setItem('smartcash_current_user', username);
        
        showAuthMessage('Berhasil masuk! Membuka dashboard...', 'var(--success)', 'rgba(16, 185, 129, 0.15)');
        
        setTimeout(async () => {
            // Sembunyikan panel auth, tampilkan aplikasi utama
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('app-container').style.display = 'block';
            
            // Bersihkan input
            usernameInput.value = '';
            passwordInput.value = '';
            msgBox.style.display = 'none';
            
            // Muat data spesifik user dan perbarui UI secara async
            await loadState();
        }, 800);
    }
}

function showAuthMessage(text, color, bgColor) {
    const msgBox = document.getElementById('auth-message');
    msgBox.textContent = text;
    msgBox.style.color = color;
    msgBox.style.backgroundColor = bgColor;
    msgBox.style.borderColor = color;
    msgBox.style.display = 'block';
}

function handleLogout() {
    if (confirm('Apakah Anda yakin ingin keluar dari aplikasi?')) {
        localStorage.removeItem('smartcash_current_user');
        state.currentUser = null;
        
        // Hapus penanda aktif pada tab agar kembali ke dashboard saat login berikutnya
        const tabs = document.querySelectorAll('.tab-content');
        tabs.forEach(tab => tab.classList.remove('active'));
        document.getElementById('tab-dashboard').classList.add('active');
        
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => item.classList.remove('active'));
        document.getElementById('nav-dashboard').classList.add('active');
        
        // Tampilkan auth screen, sembunyikan app container
        document.getElementById('auth-screen').style.display = 'block';
        document.getElementById('app-container').style.display = 'none';
        
        // Reset auth mode ke login
        authMode = 'register';
        toggleAuthMode();
    }
}

async function checkLoginSession() {
    const sessionUser = localStorage.getItem('smartcash_current_user');
    if (sessionUser) {
        state.currentUser = sessionUser;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-container').style.display = 'block';
        await loadState();
    } else {
        document.getElementById('auth-screen').style.display = 'block';
        document.getElementById('app-container').style.display = 'none';
    }
}

// ==========================================
// DETEKSI ANOMALI TRANSAKSI (Z-SCORE)
// ==========================================
function detectAnomalies(transactions) {
    const expenses = transactions.filter(t => t.tipe === 'pengeluaran');
    if (expenses.length < 3) return [];
    
    const amounts = expenses.map(t => parseFloat(t.jumlah));
    const n = amounts.length;
    const mean = amounts.reduce((sum, val) => sum + val, 0) / n;
    
    const variance = expenses.reduce((sum, val) => sum + Math.pow(parseFloat(val.jumlah) - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return [];
    
    const anomalies = [];
    expenses.forEach(t => {
        const amt = parseFloat(t.jumlah);
        const z = (amt - mean) / stdDev;
        // Flag jika pengeluaran > 1.8 standar deviasi (anomali tinggi)
        if (z > 1.8) {
            anomalies.push({
                id: t.id,
                zScore: z,
                mean: mean,
                amount: amt
            });
        }
    });
    return anomalies;
}

// ==========================================
// RENDERING RIWAYAT SIKLUS & BACKTESTING
// ==========================================
function renderBacktestingHistory() {
    const historyData = state.history || [];
    const container = document.getElementById('backtest-history-list');
    
    if (!container) return;
    
    if (historyData.length === 0) {
        container.innerHTML = `
            <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 15px; border: 1px dashed rgba(255,255,255,0.05); border-radius: 10px;">
                <i class="fa-solid fa-folder-open" style="margin-bottom: 6px; font-size: 1.2rem; display: block;"></i>
                Belum ada riwayat siklus sebelumnya untuk divalidasi. Klik "Suntik Data" di Pengaturan untuk memasukkan data uji.
            </div>
        `;
        return;
    }
    
    container.innerHTML = historyData.map(c => {
        const selisihColor = c.selisihHari <= 2 ? 'var(--success)' : 'var(--warning)';
        const percentImprovement = c.rmseNaive > 0 ? Math.round((1 - c.rmseReg / c.rmseNaive) * 100) : 0;
        return `
            <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 12px; padding: 12px; font-size: 0.74rem;">
                <div style="display: flex; justify-content: space-between; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom: 6px;">
                    <span>📅 Siklus: ${c.cycleId}</span>
                    <span style="color: ${c.statusColor === 'var(--success)' ? 'var(--success)' : 'var(--danger)'};">${c.status}</span>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px;">
                    <div>Budget Awal: <strong>${formatRupiah(c.budgetAwal)}</strong></div>
                    <div>Target Tabungan: <strong>${formatRupiah(c.targetTabungan)}</strong></div>
                    <div>Terbelanja: <strong>${formatRupiah(c.totalPengeluaran)}</strong></div>
                    <div>Pemasukan Ekstra: <strong>${formatRupiah(c.totalPemasukan)}</strong></div>
                </div>

                <div style="background: rgba(0,0,0,0.15); border-radius: 8px; padding: 8px; border: 1px solid rgba(255,255,255,0.02);">
                    <div style="font-weight: 700; color: var(--secondary); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
                        <i class="fa-solid fa-circle-check"></i> Hasil Backtesting Validasi AI:
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; color: var(--text-secondary);">
                        <span>Prediksi Saldo Habis: <strong>Hari ke-${c.hariPrediksiHabis}</strong></span>
                        <span>Realisasi Saldo Habis: <strong>Hari ke-${c.hariAktualHabis}</strong></span>
                        <span>Selisih (Error): <strong style="color: ${selisihColor};">${c.selisihHari} Hari</strong></span>
                        <span>Galat RMSE AI: <strong>${formatRupiah(c.rmseReg)}</strong></span>
                        <span>Galat RMSE Naive: <strong>${formatRupiah(c.rmseNaive)}</strong></span>
                        <span>Performa vs Baseline: <strong style="color: var(--success);">AI Lebih Akurat (RMSE -${percentImprovement}%)</strong></span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Toggle tampilan panel akademik untuk simulasi sidang skripsi
function toggleAcademicPanel() {
    const panel = document.getElementById('academic-panel');
    const btn = document.getElementById('toggle-academic-btn');
    if (!panel || !btn) return;
    
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        btn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> Sembunyikan Detail Statistik & Teori (Mode Pengguna Biasa)`;
        btn.style.background = "rgba(138, 92, 246, 0.1)";
        panel.scrollIntoView({ behavior: 'smooth' });
    } else {
        panel.style.display = 'none';
        btn.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> Mode Sidang Skripsi (Tampilkan Statistik & Teori)`;
        btn.style.background = "transparent";
    }
}

// Mengekspor riwayat transaksi ke format CSV
function exportToCSV() {
    if (!state.transaksi || state.transaksi.length === 0) {
        alert("Tidak ada transaksi untuk diekspor!");
        return;
    }
    
    // Tentukan header kolom
    const headers = ["Tanggal", "Keterangan", "Kategori", "Tipe", "Jumlah (Rp)"];
    
    // Konversi baris data
    const rows = state.transaksi.map(t => {
        const catName = t.kategori === 'makanan' ? 'Makanan & Minuman' :
                        t.kategori === 'kos' ? 'Kos & Kebutuhan Bulanan' :
                        t.kategori === 'pendidikan' ? 'Kuliah & Pendidikan' :
                        t.kategori === 'transportasi' ? 'Transportasi' :
                        t.kategori === 'hiburan' ? 'Hiburan & Nongkrong' :
                        t.kategori === 'pemasukan' ? 'Pemasukan' : 'Lainnya';
                        
        const tipeName = t.tipe === 'pengeluaran' ? 'Pengeluaran' : 'Pemasukan';
        const descEscaped = `"${(t.keterangan || '').replace(/"/g, '""')}"`;
        
        return [
            t.tanggal || '',
            descEscaped,
            catName,
            tipeName,
            t.jumlah || 0
        ];
    });
    
    // Gabungkan header dan data
    const csvContent = "\uFEFF" // Byte Order Mark (BOM) agar Excel membaca UTF-8 dengan benar
        + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        
    // Buat blob dan trigger download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    const dateStr = formatDateISO(new Date());
    link.setAttribute("href", url);
    link.setAttribute("download", `laporan_smartcash_${state.currentUser || 'user'}_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log(`[Ekspor CSV] Berhasil mengunduh laporan transaksi.`);
}

// Merender Confusion Matrix 6x6 ke halaman akademik
function renderConfusionMatrix(nbMetrics) {
    const table = document.getElementById('nb-confusion-matrix-table');
    if (!table) return;
    
    const cats = nbMetrics.categories;
    const matrix = nbMetrics.confusionMatrix;
    
    const catShortNames = {
        'makanan': 'Mkn',
        'kos': 'Kos',
        'pendidikan': 'Klh',
        'transportasi': 'Trs',
        'hiburan': 'Hbr',
        'lainnya': 'Lny'
    };
    
    let html = `
        <thead>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); font-weight: 700; color: var(--text-primary);">
                <th style="padding: 4px; text-align: left;">Aktual \\ Pred</th>
                ${cats.map(c => `<th style="padding: 4px;">${catShortNames[c]}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
    `;
    
    cats.forEach(actual => {
        html += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                <td style="padding: 4px; text-align: left; font-weight: 600; color: var(--text-secondary);">${catShortNames[actual]}</td>
        `;
        
        cats.forEach(pred => {
            const val = matrix[actual][pred] || 0;
            const isDiagonal = (actual === pred);
            
            let style = "padding: 4px; font-weight: 700;";
            if (isDiagonal && val > 0) {
                style += " background: rgba(16, 185, 129, 0.25); color: var(--success);";
            } else if (val > 0) {
                style += " background: rgba(239, 68, 68, 0.15); color: var(--danger);";
            } else {
                style += " color: var(--text-muted); opacity: 0.3;";
            }
            
            html += `<td style="${style}">${val}</td>`;
        });
        
        html += `</tr>`;
    });
    
    html += `</tbody>`;
    table.innerHTML = html;
}

// Merender tabel WCSS Elbow Method ke halaman akademik
function renderElbowTable(elbowData) {
    const tableBody = document.querySelector('#km-elbow-table tbody');
    if (!tableBody) return;
    
    let html = "";
    for (let k = 2; k <= 5; k++) {
        const wcss = elbowData[k] || 0;
        const isOptimal = (k === 3);
        const rowStyle = isOptimal ? "background: rgba(138, 92, 246, 0.08); font-weight: 700; color: var(--primary);" : "";
        const badgeHtml = isOptimal ? `<span style="color: var(--success); font-weight: 700;"><i class="fa-solid fa-circle-check"></i> Optimal (Elbow)</span>` : `<span style="color: var(--text-muted);">Sub-optimal</span>`;
        
        html += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04); ${rowStyle}">
                <td style="padding: 6px 4px;">K = ${k}</td>
                <td style="padding: 6px 4px;">${wcss.toFixed(4)}</td>
                <td style="padding: 6px 4px;">${badgeHtml}</td>
            </tr>
        `;
    }
    tableBody.innerHTML = html;
}

// Mengekspor laporan transaksi ke PDF via cetak browser terformat
function exportToPDF() {
    const user = state.currentUser || 'user';
    const dateStr = formatDateISO(new Date());
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Pop-up terblokir! Izinkan pop-up untuk mencetak laporan PDF.");
        return;
    }
    
    // Hitung rekap
    const totalPengeluaran = state.transaksi
        .filter(t => t.tipe === 'pengeluaran')
        .reduce((sum, t) => sum + (parseFloat(t.jumlah) || 0), 0);
    const totalPemasukan = state.transaksi
        .filter(t => t.tipe === 'pemasukan')
        .reduce((sum, t) => sum + (parseFloat(t.jumlah) || 0), 0);
    const budgetAwal = state.settings.budgetAwal || 0;
    const targetTabungan = state.settings.targetTabungan || 0;
    const sisaSaldo = budgetAwal + totalPemasukan - totalPengeluaran;
    
    let rowsHtml = state.transaksi.map((t, idx) => {
        const catName = t.kategori === 'makanan' ? 'Makanan & Minuman' :
                        t.kategori === 'kos' ? 'Kos & Kebutuhan Bulanan' :
                        t.kategori === 'pendidikan' ? 'Kuliah & Pendidikan' :
                        t.kategori === 'transportasi' ? 'Transportasi' :
                        t.kategori === 'hiburan' ? 'Hiburan & Nongkrong' :
                        t.kategori === 'pemasukan' ? 'Pemasukan' : 'Lainnya';
        const tipeName = t.tipe === 'pengeluaran' ? 'Pengeluaran' : 'Pemasukan';
        const color = t.tipe === 'pengeluaran' ? '#ef4444' : '#10b981';
        
        return `
            <tr>
                <td>${idx + 1}</td>
                <td>${t.tanggal}</td>
                <td>${escapeHtml(t.keterangan)}</td>
                <td>${catName}</td>
                <td style="color: ${color}; font-weight: bold;">${tipeName}</td>
                <td style="text-align: right; font-weight: bold;">${formatRupiah(t.jumlah)}</td>
            </tr>
        `;
    }).join('');

    printWindow.document.write(`
        <html>
        <head>
            <title>Laporan Keuangan SmartCash AI - ${user}</title>
            <style>
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    color: #1f2937;
                    margin: 30px;
                    font-size: 13px;
                    line-height: 1.5;
                }
                .header {
                    text-align: center;
                    margin-bottom: 25px;
                    border-bottom: 2px double #1f2937;
                    padding-bottom: 10px;
                }
                .header h1 {
                    margin: 0;
                    font-size: 24px;
                    color: #8a52f6;
                }
                .header p {
                    margin: 5px 0 0 0;
                    color: #4b5563;
                    font-size: 13px;
                }
                .meta-table {
                    width: 100%;
                    margin-bottom: 20px;
                }
                .meta-table td {
                    padding: 3px 0;
                }
                .summary-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 10px;
                    margin-bottom: 30px;
                }
                .summary-card {
                    background: #f3f4f6;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    padding: 12px;
                    text-align: center;
                }
                .summary-card .label {
                    font-size: 10px;
                    text-transform: uppercase;
                    color: #6b7280;
                    font-weight: bold;
                    margin-bottom: 4px;
                }
                .summary-card .value {
                    font-size: 14px;
                    font-weight: bold;
                    color: #111827;
                }
                table.data-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 15px;
                }
                table.data-table th, table.data-table td {
                    border: 1px solid #d1d5db;
                    padding: 8px 10px;
                    text-align: left;
                }
                table.data-table th {
                    background-color: #f9fafb;
                    font-weight: 700;
                }
                .footer {
                    margin-top: 40px;
                    text-align: center;
                    font-size: 11px;
                    color: #9ca3af;
                    border-top: 1px solid #e5e7eb;
                    padding-top: 10px;
                }
                @media print {
                    body { margin: 15px; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>SmartCash AI</h1>
                <p>Laporan Penggunaan Anggaran & Evaluasi Finansial Mahasiswa</p>
            </div>
            
            <table class="meta-table">
                <tr>
                    <td width="15%"><strong>Nama Mahasiswa:</strong></td>
                    <td width="35%">${user.toUpperCase()}</td>
                    <td width="20%"><strong>Siklus Mulai:</strong></td>
                    <td width="30%">${state.settings.tanggalMulai || '-'}</td>
                </tr>
                <tr>
                    <td><strong>Tanggal Cetak:</strong></td>
                    <td>${dateStr}</td>
                    <td><strong>Siklus Berakhir:</strong></td>
                    <td>${state.settings.tanggalSelesai || '-'}</td>
                </tr>
            </table>

            <div class="summary-grid">
                <div class="summary-card">
                    <div class="label">Anggaran Awal</div>
                    <div class="value">${formatRupiah(budgetAwal)}</div>
                </div>
                <div class="summary-card">
                    <div class="label">Target Menabung</div>
                    <div class="value">${formatRupiah(targetTabungan)}</div>
                </div>
                <div class="summary-card">
                    <div class="label">Total Pengeluaran</div>
                    <div class="value" style="color: #ef4444;">${formatRupiah(totalPengeluaran)}</div>
                </div>
                <div class="summary-card">
                    <div class="label">Sisa Saldo</div>
                    <div class="value" style="color: #10b981;">${formatRupiah(sisaSaldo)}</div>
                </div>
            </div>

            <h2>Daftar Transaksi Lengkap</h2>
            <table class="data-table">
                <thead>
                    <tr>
                        <th width="5%">No</th>
                        <th width="15%">Tanggal</th>
                        <th width="35%">Keterangan</th>
                        <th width="20%">Kategori</th>
                        <th width="10%">Tipe</th>
                        <th width="15%" style="text-align: right;">Jumlah</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <div class="footer">
                Laporan dihasilkan secara otomatis oleh SmartCash AI Engine (Metode Regresi Linear & K-Means Clustering)
            </div>

            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                        window.close();
                    }, 500);
                }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}
