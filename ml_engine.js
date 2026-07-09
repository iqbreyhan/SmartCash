/**
 * SmartCash AI - Machine Learning Engine
 * Mengimplementasikan:
 * 1. Naive Bayes Classifier untuk Klasifikasi Teks Auto-Kategori
 * 2. K-Means Clustering untuk Segmentasi Rekomendasi Anggaran Kelompok
 * 3. Modul Evaluasi Model Dinamis (Akurasi, Presisi, Recall, F1-Score, WCSS)
 */

class NaiveBayesClassifier {
    constructor() {
        this.categories = ['makanan', 'kos', 'pendidikan', 'transportasi', 'hiburan', 'lainnya'];
        this.wordCounts = {}; // category -> word -> count
        this.docCounts = {};  // category -> count
        this.totalDocs = 0;
        this.vocabulary = new Set();
        
        // Inisialisasi struktur data
        this.categories.forEach(cat => {
            this.wordCounts[cat] = {};
            this.docCounts[cat] = 0;
        });

        // Bootstrap: Dataset latih awal khas mahasiswa untuk mengatasi Cold-Start
        this.loadDefaultTrainingData();
    }

    loadDefaultTrainingData() {
        const defaultData = [
            // Kategori: Makanan & Minuman
            { text: "makan siang nasi padang warteg ayam bakar geprek gofood bumbu", category: "makanan" },
            { text: "beli es teh kopi susu boba starbucks indomaret cemilan roti snack", category: "makanan" },
            { text: "belanja sayur lauk pauk telur warung indomie mie instan sarapan", category: "makanan" },
            { text: "makan malam sate padang bakso mie ayam soto bubur kantin", category: "makanan" },
            
            // Kategori: Kos & Kebutuhan Bulanan
            { text: "bayar kos bulanan token listrik air sabun cuci detergen laundry kasur", category: "kos" },
            { text: "belanja bulanan supermarket odol sikat gigi sampo tisu sapu ember", category: "kos" },
            { text: "galon aqua gas elpiji sewa kamar iuran kebersihan air minum", category: "kos" },
            
            // Kategori: Kuliah & Pendidikan
            { text: "fotokopi print jilid buku cetak modul kuliah fotocopy alat tulis pensil bolpen", category: "pendidikan" },
            { text: "bayar ukt semesteran kuliah modul praktikum kartu krs sertifikat seminar", category: "pendidikan" },
            { text: "beli kertas hvs penggaris map kalkulator diktat ujian praktikum", category: "pendidikan" },
            
            // Kategori: Transportasi
            { text: "bensin pertalite pertamax ojek online grab gojek motor mobil tol parkir", category: "transportasi" },
            { text: "tiket bus kereta travel mudik mrt lrt commuter line stasiun bandara", category: "transportasi" },
            { text: "tambal ban oli motor servis bengkel helm kartu e-toll tarif angkot", category: "transportasi" },
            
            // Kategori: Hiburan & Nongkrong
            { text: "nonton bioskop xxi netflix spotify youtube premium game topup mabar ml", category: "hiburan" },
            { text: "nongkrong kafe cafe rokok kopi ngudud billiard jalan-jalan healing liburan", category: "hiburan" },
            { text: "konser musik karaoke timezone sewa ps clubbing jajan biliar", category: "hiburan" },
            
            // Kategori: Lainnya
            { text: "kondangan sumbangan kado obat apotek sakit dokter transfer teman minjem", category: "lainnya" },
            { text: "pajak biaya admin tarik tunai sedekah zakat ganti rugi rusak ilang", category: "lainnya" }
        ];

        defaultData.forEach(d => this.train(d.text, d.category));
    }

    tokenize(text) {
        if (!text) return [];
        return text.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '') // bersihkan tanda baca
            .split(/\s+/)
            .filter(w => w.length > 1); // abaikan kata 1 huruf
    }

    train(text, category) {
        if (!this.categories.includes(category)) return;
        const tokens = this.tokenize(text);
        if (tokens.length === 0) return;

        this.docCounts[category]++;
        this.totalDocs++;

        tokens.forEach(token => {
            this.wordCounts[category][token] = (this.wordCounts[category][token] || 0) + 1;
            this.vocabulary.add(token);
        });
    }

    classify(text) {
        const tokens = this.tokenize(text);
        if (tokens.length === 0) {
            return { category: 'lainnya', confidence: 0 };
        }

        let bestCategory = 'lainnya';
        let bestScore = -Infinity;
        const scores = {};

        this.categories.forEach(cat => {
            // Prior probability: P(C)
            const pC = this.docCounts[cat] / (this.totalDocs || 1);
            let score = Math.log(pC || 0.0001);

            // Laplace Smoothing parameter
            const vSize = this.vocabulary.size || 1;
            const totalWordCountInCat = Object.values(this.wordCounts[cat]).reduce((a, b) => a + b, 0);

            tokens.forEach(token => {
                // Likelihood P(W|C) dengan Laplace Smoothing (+1)
                const count = this.wordCounts[cat][token] || 0;
                const pWC = (count + 1) / (totalWordCountInCat + vSize);
                score += Math.log(pWC);
            });

            scores[cat] = score;
            if (score > bestScore) {
                bestScore = score;
                bestCategory = cat;
            }
        });

        // Hitung persentase keyakinan (Confidence Score) menggunakan soft-max log-scaling
        const expScores = {};
        let sumExp = 0;
        this.categories.forEach(cat => {
            const exp = Math.exp(scores[cat] - bestScore); // Normalisasi selisih agar tidak overflow
            expScores[cat] = exp;
            sumExp += exp;
        });

        const confidence = Math.round((expScores[bestCategory] / (sumExp || 1)) * 100);

        return {
            category: bestCategory,
            confidence: confidence
        };
    }

    /**
     * Evaluasi Performa Kuantitatif Model (Hold-Out Testing Dataset)
     * Menghasilkan Akurasi, Presisi, Recall, F1-Score, dan Confusion Matrix secara dinamis
     */
    evaluateModel() {
        // Dataset uji independen
        const testSet = [
            { text: "beli bubur ayam mang husein", category: "makanan" },
            { text: "kopi kenangan susu gula aren", category: "makanan" },
            { text: "bayar token listrik kosan bulanan", category: "kos" },
            { text: "laundry karpet wangi laundry kiloan", category: "kos" },
            { text: "beli bolpoin penggaris binder kuliah", category: "pendidikan" },
            { text: "fotocopy modul pratikum sistem basis data", category: "pendidikan" },
            { text: "isi bensin pertamax scoopy", category: "transportasi" },
            { text: "ongkos ojek online gojek grab", category: "transportasi" },
            { text: "nonton bioskop film horor xxi", category: "hiburan" },
            { text: "ngopi nongkrong santai cafe", category: "hiburan" },
            { text: "membeli obat panadol pusing di apotek", category: "lainnya" },
            { text: "kado nikahan wisuda temen sekelas", category: "lainnya" }
        ];

        let correct = 0;
        const tp = {};
        const fp = {};
        const fn = {};
        
        // Inisialisasi Confusion Matrix 6x6
        const confusionMatrix = {};
        this.categories.forEach(actualCat => {
            confusionMatrix[actualCat] = {};
            this.categories.forEach(predCat => {
                confusionMatrix[actualCat][predCat] = 0;
            });
        });

        this.categories.forEach(cat => {
            tp[cat] = 0;
            fp[cat] = 0;
            fn[cat] = 0;
        });

        testSet.forEach(sample => {
            const pred = this.classify(sample.text).category;
            const actual = sample.category;

            // Catat ke Confusion Matrix
            if (confusionMatrix[actual] && confusionMatrix[actual].hasOwnProperty(pred)) {
                confusionMatrix[actual][pred]++;
            }

            if (pred === actual) {
                correct++;
                tp[actual]++;
            } else {
                fp[pred]++;
                fn[actual]++;
            }
        });

        const accuracy = correct / testSet.length;

        // Hitung makro presisi, recall, dan F1-Score
        let totalPrecision = 0;
        let totalRecall = 0;
        let totalF1 = 0;
        let validClasses = 0;

        this.categories.forEach(cat => {
            const precision = tp[cat] + fp[cat] > 0 ? tp[cat] / (tp[cat] + fp[cat]) : 0;
            const recall = tp[cat] + fn[cat] > 0 ? tp[cat] / (tp[cat] + fn[cat]) : 0;
            const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

            totalPrecision += precision;
            totalRecall += recall;
            totalF1 += f1;
            validClasses++;
        });

        return {
            accuracy: accuracy,
            precision: totalPrecision / validClasses,
            recall: totalRecall / validClasses,
            f1Score: totalF1 / validClasses,
            confusionMatrix: confusionMatrix,
            categories: this.categories,
            testSize: testSet.length
        };
    }
}

class KMeansRecommender {
    constructor() {
        this.k = 3;
        this.centroids = [
            [0.15, 0.75, 0.10], // Centroid awal Klaster 0 (Hemat): Belanja rendah, Tabungan tinggi, Hiburan rendah
            [0.75, 0.15, 0.65], // Centroid awal Klaster 1 (Konsumtif): Belanja tinggi, Tabungan rendah, Hiburan tinggi
            [0.45, 0.40, 0.25]  // Centroid awal Klaster 2 (Primer Tinggi): Belanja sedang, Tabungan sedang, Hiburan sedang
        ];
        
        this.clusterMetadata = {
            0: {
                name: "Hemat & Terencana (Frugal)",
                color: "var(--success)",
                desc: "Profil Anda masuk ke klaster hemat. Anda sangat disiplin dalam membatasi pengeluaran hiburan dan memprioritaskan tabungan.",
                advice: "Hebat! Pengeluaran Anda sejalan dengan klaster hemat. Pertahankan rasio tabungan ini untuk mengamankan beasiswa/dana darurat Anda."
            },
            1: {
                name: "Konsumtif & Hiburan Tinggi (Social Spender)",
                color: "var(--danger)",
                desc: "Profil Anda menunjukkan pengeluaran hiburan/nongkrong di atas rata-rata kelompok sebaya, dan tingkat menabung sangat kritis.",
                advice: "Peringatan! Klaster Anda cenderung rentan kehabisan saldo sebelum kiriman berikutnya datang. Batasi nongkrong akhir pekan sebesar 20%."
            },
            2: {
                name: "Kebutuhan Primer Tinggi (Hardpressed)",
                color: "var(--warning)",
                desc: "Pengeluaran Anda didominasi oleh tagihan wajib berbiaya tetap (seperti kos, buku kuliah, ukt, dan transportasi).",
                advice: "Pengeluaran Anda bersifat krusial dan wajib. Cobalah berhemat di pos makanan dengan memasak sendiri untuk menaikkan kapasitas tabungan."
            }
        };
    }

    /**
     * Dataset Simulasi 50 Profil Mahasiswa Lain (Berdasarkan parameter studi anggaran mahasiswa nasional)
     * Digunakan sebagai baseline peer-group untuk clustering
     */
    generateSyntheticPeers() {
        const peers = [];
        
        // Klaster 0: Mahasiswa Hemat (20 data)
        // Fitur: [avgDailySpend, savingsRate, entertainmentRatio]
        for(let i = 0; i < 20; i++) {
            peers.push({
                features: [
                    20000 + Math.random() * 15000, // Rp 20k - Rp 35k
                    0.25 + Math.random() * 0.15,   // 25% - 40% tabungan
                    0.03 + Math.random() * 0.07    // 3% - 10% hiburan
                ]
            });
        }

        // Klaster 1: Mahasiswa Konsumtif (15 data)
        for(let i = 0; i < 15; i++) {
            peers.push({
                features: [
                    70000 + Math.random() * 60000, // Rp 70k - Rp 130k
                    0.01 + Math.random() * 0.08,   // 1% - 9% tabungan
                    0.30 + Math.random() * 0.25    // 30% - 55% hiburan
                ]
            });
        }

        // Klaster 2: Mahasiswa Kebutuhan Primer Tinggi (15 data)
        for(let i = 0; i < 15; i++) {
            peers.push({
                features: [
                    45000 + Math.random() * 20000, // Rp 45k - Rp 65k
                    0.10 + Math.random() * 0.12,   // 10% - 22% tabungan
                    0.08 + Math.random() * 0.10    // 8% - 18% hiburan
                ]
            });
        }

        return peers;
    }

    /**
     * Jalankan Clustering K-Means Secara Dinamis
     * Menerima fitur pengguna: [rata-rata belanja, rasio tabungan, rasio hiburan]
     */
    runClustering(userFeatures) {
        const peers = this.generateSyntheticPeers();
        const userIndex = peers.length;
        peers.push({ features: userFeatures });

        const numFeatures = userFeatures.length;

        // 1. Preprocessing: Min-Max Normalization agar fitur setara [0, 1]
        const mins = Array(numFeatures).fill(Infinity);
        const maxs = Array(numFeatures).fill(-Infinity);

        peers.forEach(p => {
            for(let j = 0; j < numFeatures; j++) {
                if (p.features[j] < mins[j]) mins[j] = p.features[j];
                if (p.features[j] > maxs[j]) maxs[j] = p.features[j];
            }
        });

        peers.forEach(p => {
            p.normalized = p.features.map((val, idx) => {
                const range = maxs[idx] - mins[idx];
                return range === 0 ? 0 : (val - mins[idx]) / range;
            });
        });

        // 2. Iterasi K-Means
        let changed = true;
        let iter = 0;

        while (changed && iter < 15) {
            changed = false;
            iter++;

            // A. Assign titik data ke klaster terdekat (Euclidean Distance)
            peers.forEach(p => {
                let bestCluster = 0;
                let minDist = Infinity;

                for(let c = 0; c < this.k; c++) {
                    let distSq = 0;
                    for(let j = 0; j < numFeatures; j++) {
                        distSq += Math.pow(p.normalized[j] - this.centroids[c][j], 2);
                    }
                    const dist = Math.sqrt(distSq);

                    if (dist < minDist) {
                        minDist = dist;
                        bestCluster = c;
                    }
                }

                if (p.cluster !== bestCluster) {
                    p.cluster = bestCluster;
                    changed = true;
                }
            });

            // B. Hitung ulang Centroid baru (rata-rata dari anggota klaster)
            for(let c = 0; c < this.k; c++) {
                const members = peers.filter(p => p.cluster === c);
                if (members.length === 0) continue;

                const newCentroid = Array(numFeatures).fill(0);
                members.forEach(p => {
                    for(let j = 0; j < numFeatures; j++) {
                        newCentroid[j] += p.normalized[j];
                    }
                });

                for(let j = 0; j < numFeatures; j++) {
                    this.centroids[c][j] = newCentroid[j] / members.length;
                }
            }
        }

        // 3. Hitung WCSS (Within-Cluster Sum of Squares) untuk validasi model
        let wcss = 0;
        peers.forEach(p => {
            const c = p.cluster;
            let distSq = 0;
            for(let j = 0; j < numFeatures; j++) {
                distSq += Math.pow(p.normalized[j] - this.centroids[c][j], 2);
            }
            wcss += distSq;
        });

        const userClusterId = peers[userIndex].cluster;
        
        // 4. Hitung Elbow WCSS untuk K = 2, 3, 4, 5
        const normalizedPointsOnly = peers.map(p => p.normalized);
        const elbowResults = this.calculateElbowWCSS(normalizedPointsOnly);

        return {
            clusterId: userClusterId,
            metadata: this.clusterMetadata[userClusterId],
            wcss: wcss,
            normalizedUser: peers[userIndex].normalized,
            totalDataSize: peers.length,
            elbow: elbowResults
        };
    }

    calculateElbowWCSS(normalizedPoints) {
        const elbowResults = {};
        const numFeatures = 3;
        
        for (let kVal = 2; kVal <= 5; kVal++) {
            // Centroids awal didasarkan pada pembagian rentang dataset
            let tempCentroids = [];
            for (let c = 0; c < kVal; c++) {
                const idx = Math.floor((c / kVal) * normalizedPoints.length);
                tempCentroids.push([...normalizedPoints[idx]]);
            }
            
            let tempClusters = Array(normalizedPoints.length).fill(-1);
            let changed = true;
            let iter = 0;
            
            while (changed && iter < 10) {
                changed = false;
                iter++;
                
                // Assign data points to closest centroid
                normalizedPoints.forEach((p, pIdx) => {
                    let bestCluster = 0;
                    let minDist = Infinity;
                    
                    for (let c = 0; c < kVal; c++) {
                        let distSq = 0;
                        for (let j = 0; j < numFeatures; j++) {
                            distSq += Math.pow(p[j] - tempCentroids[c][j], 2);
                        }
                        const dist = Math.sqrt(distSq);
                        if (dist < minDist) {
                            minDist = dist;
                            bestCluster = c;
                        }
                    }
                    
                    if (tempClusters[pIdx] !== bestCluster) {
                        tempClusters[pIdx] = bestCluster;
                        changed = true;
                    }
                });
                
                // Re-calculate centroids
                for (let c = 0; c < kVal; c++) {
                    const membersIndices = [];
                    tempClusters.forEach((cl, idx) => {
                        if (cl === c) membersIndices.push(idx);
                    });
                    
                    if (membersIndices.length === 0) continue;
                    
                    const newCentroid = Array(numFeatures).fill(0);
                    membersIndices.forEach(idx => {
                        for (let j = 0; j < numFeatures; j++) {
                            newCentroid[j] += normalizedPoints[idx][j];
                        }
                    });
                    
                    for (let j = 0; j < numFeatures; j++) {
                        tempCentroids[c][j] = newCentroid[j] / membersIndices.length;
                    }
                }
            }
            
            // Hitung WCSS untuk K ini
            let wcss = 0;
            normalizedPoints.forEach((p, pIdx) => {
                const c = tempClusters[pIdx];
                if (c === -1) return;
                let distSq = 0;
                for (let j = 0; j < numFeatures; j++) {
                    distSq += Math.pow(p[j] - tempCentroids[c][j], 2);
                }
                wcss += distSq;
            });
            
            elbowResults[kVal] = wcss;
        }
        
        return elbowResults;
    }
}
