/**
 * Layanan Database Hybrid: Supabase Cloud (Online) & LocalStorage (Offline Fallback)
 * Skripsi: Aplikasi Pencatat Keuangan Mahasiswa + AI Forecast
 */

// Gunakan nama 'supabaseClient' agar tidak berbenturan dengan 'supabase' global dari CDN
let supabaseClient = null;

const DbService = {
    isOnline: false,

    // 1. AUTH & USER REGISTRATION
    async registerUser(username, password) {
        if (this.isOnline && supabaseClient) {
            try {
                // Cek apakah username sudah ada
                const { data: existingUser, error: checkError } = await supabaseClient
                    .from('users')
                    .select('username')
                    .eq('username', username)
                    .maybeSingle();
                
                if (checkError) throw checkError;
                if (existingUser) {
                    return { error: "Username sudah terdaftar!" };
                }
                
                // Tambahkan user baru
                const { error: insertError } = await supabaseClient
                    .from('users')
                    .insert([{ username, password }]);
                
                if (insertError) throw insertError;
                
                // Tambahkan default settings untuk user baru
                const today = new Date();
                const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                
                await supabaseClient.from('settings').insert([{
                    username,
                    budget_awal: 1500000,
                    target_menabung: 0,
                    tanggal_mulai: firstDay.toISOString().split('T')[0],
                    tanggal_selesai: lastDay.toISOString().split('T')[0]
                }]);

                return { success: true };
            } catch (e) {
                console.error("Supabase Register error:", e);
                return { error: `Database error: ${e.message}` };
            }
        } else {
            // LocalStorage Fallback
            let users = JSON.parse(localStorage.getItem('smartcash_users') || '{}');
            if (users[username]) {
                return { error: "Username sudah terdaftar!" };
            }
            users[username] = password;
            localStorage.setItem('smartcash_users', JSON.stringify(users));
            return { success: true };
        }
    },
    
    // 2. USER LOGIN
    async loginUser(username, password) {
        if (this.isOnline && supabaseClient) {
            try {
                const { data: user, error } = await supabaseClient
                    .from('users')
                    .select('*')
                    .eq('username', username)
                    .maybeSingle();
                
                if (error) throw error;
                if (!user || user.password !== password) {
                    return { error: "Username atau Password salah!" };
                }
                
                return { success: true, user };
            } catch (e) {
                console.error("Supabase Login error:", e);
                return { error: `Database error: ${e.message}` };
            }
        } else {
            // LocalStorage Fallback
            let users = JSON.parse(localStorage.getItem('smartcash_users') || '{}');
            if (!users[username] || users[username] !== password) {
                return { error: "Username atau Password salah!" };
            }
            return { success: true };
        }
    },
    
    // 3. SETTINGS READ/WRITE
    async loadSettings(username) {
        if (this.isOnline && supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('settings')
                    .select('*')
                    .eq('username', username)
                    .maybeSingle();
                
                if (error) throw error;
                if (data) {
                    return {
                        budgetAwal: parseFloat(data.budget_awal),
                        targetMenabung: parseFloat(data.target_menabung),
                        tanggalMulai: data.tanggal_mulai,
                        tanggalSelesai: data.tanggal_selesai,
                        categoryLimits: data.category_limits || null
                    };
                }
                return null;
            } catch (e) {
                console.error("Supabase loadSettings error:", e);
                return null;
            }
        } else {
            // LocalStorage Fallback
            const savedSettings = localStorage.getItem(`smartcash_settings_${username}`);
            return savedSettings ? JSON.parse(savedSettings) : null;
        }
    },
    
    async saveSettings(username, settings) {
        if (this.isOnline && supabaseClient) {
            try {
                const payload = {
                    username,
                    budget_awal: settings.budgetAwal,
                    target_menabung: settings.targetMenabung,
                    tanggal_mulai: settings.tanggalMulai,
                    tanggal_selesai: settings.tanggalSelesai,
                    updated_at: new Date().toISOString()
                };
                
                if (settings.categoryLimits) {
                    payload.category_limits = settings.categoryLimits;
                }
                
                const { error } = await supabaseClient
                    .from('settings')
                    .upsert(payload);
                
                if (error) {
                    // Jika kolom tidak ada di database, coba upsert tanpa category_limits (graceful fallback)
                    if (error.code === '42703' || (error.message && error.message.includes('column'))) {
                        console.warn("Kolom category_limits tidak ditemukan di database. Mengabaikan kolom kustom.");
                        const { error: retryError } = await supabaseClient
                            .from('settings')
                            .upsert({
                                username,
                                budget_awal: settings.budgetAwal,
                                target_menabung: settings.targetMenabung,
                                tanggal_mulai: settings.tanggalMulai,
                                tanggal_selesai: settings.tanggalSelesai,
                                updated_at: new Date().toISOString()
                            });
                        if (retryError) throw retryError;
                    } else {
                        throw error;
                    }
                }
                return true;
            } catch (e) {
                console.error("Supabase saveSettings error:", e);
                return false;
            }
        } else {
            // LocalStorage Fallback
            localStorage.setItem(`smartcash_settings_${username}`, JSON.stringify(settings));
            return true;
        }
    },
    
    // 4. TRANSACTIONS CRUD
    async loadTransactions(username) {
        if (this.isOnline && supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('transactions')
                    .select('*')
                    .eq('username', username)
                    .order('tanggal', { ascending: true });
                
                if (error) throw error;
                return (data || []).map(t => ({
                    id: t.id,
                    tipe: t.tipe,
                    jumlah: parseFloat(t.jumlah),
                    keterangan: t.keterangan,
                    kategori: t.kategori,
                    tanggal: t.tanggal
                }));
            } catch (e) {
                console.error("Supabase loadTransactions error:", e);
                return [];
            }
        } else {
            // LocalStorage Fallback
            const savedTransactions = localStorage.getItem(`smartcash_transactions_${username}`);
            return savedTransactions ? JSON.parse(savedTransactions) : [];
        }
    },
    
    async saveTransaction(username, t) {
        if (this.isOnline && supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('transactions')
                    .upsert({
                        id: t.id,
                        username,
                        tipe: t.tipe,
                        jumlah: parseFloat(t.jumlah),
                        keterangan: t.keterangan,
                        kategori: t.kategori,
                        tanggal: t.tanggal
                    });
                
                if (error) throw error;
                return true;
            } catch (e) {
                console.error("Supabase saveTransaction error:", e);
                return false;
            }
        } else {
            // LocalStorage Fallback
            return true;
        }
    },
    
    async saveAllTransactions(username, transactions) {
        if (this.isOnline && supabaseClient) {
            try {
                // Hapus dulu transaksi lama agar sinkron
                await supabaseClient.from('transactions').delete().eq('username', username);
                
                if (transactions.length === 0) return true;
                
                const dataToInsert = transactions.map(t => ({
                    id: t.id,
                    username,
                    tipe: t.tipe,
                    jumlah: parseFloat(t.jumlah),
                    keterangan: t.keterangan,
                    kategori: t.kategori,
                    tanggal: t.tanggal
                }));
                
                const { error } = await supabaseClient
                    .from('transactions')
                    .insert(dataToInsert);
                
                if (error) throw error;
                return true;
            } catch (e) {
                console.error("Supabase saveAllTransactions error:", e);
                return false;
            }
        } else {
            // LocalStorage Fallback
            localStorage.setItem(`smartcash_transactions_${username}`, JSON.stringify(transactions));
            return true;
        }
    },
    
    async deleteTransaction(username, tId) {
        if (this.isOnline && supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('transactions')
                    .delete()
                    .eq('id', tId)
                    .eq('username', username);
                
                if (error) throw error;
                return true;
            } catch (e) {
                console.error("Supabase deleteTransaction error:", e);
                return false;
            }
        } else {
            return true;
        }
    },
    
    async clearAllTransactions(username) {
        if (this.isOnline && supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('transactions')
                    .delete()
                    .eq('username', username);
                
                if (error) throw error;
                return true;
            } catch (e) {
                console.error("Supabase clearAllTransactions error:", e);
                return false;
            }
        } else {
            // LocalStorage Fallback
            localStorage.removeItem(`smartcash_transactions_${username}`);
            return true;
        }
    },
    
    // 5. HISTORY CRUD (BACKTESTING)
    async loadHistory(username) {
        if (this.isOnline && supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('history')
                    .select('*')
                    .eq('username', username)
                    .order('created_at', { ascending: false });
                
                if (error) throw error;
                return (data || []).map(h => ({
                    cycleId: h.cycle_id,
                    tanggalMulai: h.tanggal_mulai,
                    tanggalSelesai: h.tanggal_selesai,
                    budgetAwal: parseFloat(h.budget_awal),
                    targetTabungan: parseFloat(h.target_tabungan),
                    totalPengeluaran: parseFloat(h.total_pengeluaran),
                    totalPemasukan: parseFloat(h.total_pemasukan),
                    status: h.status,
                    statusColor: h.status_color,
                    rmseReg: parseFloat(h.rmse_reg),
                    rmseNaive: parseFloat(h.rmse_naive),
                    hariPrediksiHabis: h.hari_prediksi_habis,
                    hariAktualHabis: h.hari_aktual_habis,
                    selisihHari: h.selisih_hari
                }));
            } catch (e) {
                console.error("Supabase loadHistory error:", e);
                return [];
            }
        } else {
            // LocalStorage Fallback
            const savedHistory = localStorage.getItem(`smartcash_history_${username}`);
            return savedHistory ? JSON.parse(savedHistory) : [];
        }
    },
    
    async saveHistory(username, h) {
        if (this.isOnline && supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('history')
                    .insert([{
                        username,
                        cycle_id: h.cycleId,
                        tanggal_mulai: h.tanggalMulai,
                        tanggal_selesai: h.tanggalSelesai,
                        budget_awal: h.budgetAwal,
                        target_tabungan: h.targetTabungan,
                        total_pengeluaran: h.totalPengeluaran,
                        total_pemasukan: h.totalPemasukan,
                        status: h.status,
                        status_color: h.statusColor,
                        rmse_reg: h.rmseReg,
                        rmse_naive: h.rmseNaive,
                        hari_prediksi_habis: h.hariPrediksiHabis,
                        hari_aktual_habis: h.hariAktualHabis,
                        selisih_hari: h.selisihHari
                    }]);
                
                if (error) throw error;
                return true;
            } catch (e) {
                console.error("Supabase saveHistory error:", e);
                return false;
            }
        } else {
            // LocalStorage Fallback
            let history = JSON.parse(localStorage.getItem(`smartcash_history_${username}`) || '[]');
            history.unshift(h);
            localStorage.setItem(`smartcash_history_${username}`, JSON.stringify(history));
            return true;
        }
    },
    
    async saveAllHistory(username, historyList) {
        if (this.isOnline && supabaseClient) {
            try {
                await supabaseClient.from('history').delete().eq('username', username);
                if (historyList.length === 0) return true;
                
                const dataToInsert = historyList.map(h => ({
                    username,
                    cycle_id: h.cycleId,
                    tanggal_mulai: h.tanggalMulai,
                    tanggal_selesai: h.tanggalSelesai,
                    budget_awal: h.budgetAwal,
                    target_tabungan: h.targetTabungan,
                    total_pengeluaran: h.totalPengeluaran,
                    total_pemasukan: h.totalPemasukan,
                    status: h.status,
                    status_color: h.statusColor,
                    rmse_reg: h.rmseReg,
                    rmse_naive: h.rmseNaive,
                    hari_prediksi_habis: h.hari_prediksi_habis,
                    hari_aktual_habis: h.hari_aktual_habis,
                    selisih_hari: h.selisihHari
                }));
                
                const { error } = await supabaseClient.from('history').insert(dataToInsert);
                if (error) throw error;
                return true;
            } catch (e) {
                console.error("Supabase saveAllHistory error:", e);
                return false;
            }
        } else {
            localStorage.setItem(`smartcash_history_${username}`, JSON.stringify(historyList));
            return true;
        }
    }
};

// Inisialisasi Supabase Client
function initSupabase() {
    if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY || 
        CONFIG.SUPABASE_URL.includes("your-project-id") || CONFIG.SUPABASE_ANON_KEY.includes("your-anon-key-here")) {
        console.warn("Supabase credentials not configured. Using LocalStorage offline fallback.");
        DbService.isOnline = false;
        return false;
    }
    
    try {
        // Gunakan window.supabase global dari CDN script
        if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
            console.error("Supabase library not loaded. Check internet connection.");
            DbService.isOnline = false;
            return false;
        }
        
        supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        console.log("Supabase Client initialized successfully.");
        DbService.isOnline = true;
        return true;
    } catch (e) {
        console.error("Error initializing Supabase client:", e);
        DbService.isOnline = false;
        return false;
    }
}

// Jalankan inisialisasi setelah DbService terdefinisi
initSupabase();
