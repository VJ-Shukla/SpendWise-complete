// Wrapped in an IIFE to prevent global namespace pollution
(function() {
    // ==========================================
    // CONFIGURATION
    // ==========================================
    
    const getApiBase = () => {
    // Check if the frontend is running on your laptop
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://127.0.0.1:5000'; 
    } else {
        // Otherwise, use the live Render backend
        return 'https://spendwise-backend-7ul1.onrender.com';
    }
};
    const CONFIG = {
        API_BASE: getApiBase(),
    };

    // ==========================================
    // SECURITY UTILS (FIX FOR XSS)
    // ==========================================
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // ==========================================
    // STATE MANAGEMENT
    // ==========================================
    let currentToken = localStorage.getItem('accessToken');
    let currentUser = localStorage.getItem('currentUser');
    let currentUserType = localStorage.getItem('userType'); 
    let currentEmail = localStorage.getItem('userEmail');

    let categoryChartInstance = null;
    let trendChartInstance = null;

    // ==========================================
    // NOTIFICATION SYSTEM
    // ==========================================
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
    @keyframes slideInRight {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(5px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .calendar-day.selected {
        border: 2px solid var(--primary, #4f46e5) !important;
        background: rgba(79, 70, 229, 0.2) !important;
    }
    `;
    document.head.appendChild(styleSheet);

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        let icon = 'ri-information-line';
        let bgStyle = 'linear-gradient(135deg, #333, #555)';
        
        if (type === 'success') { icon = 'ri-checkbox-circle-line'; bgStyle = 'linear-gradient(135deg, #2ecc71, #2bd6b4)'; }
        else if (type === 'danger') { icon = 'ri-error-warning-line'; bgStyle = 'linear-gradient(135deg, #ff6b6b, #ee5253)'; }
        else if (type === 'warning') { icon = 'ri-alert-line'; bgStyle = 'linear-gradient(135deg, #f1c40f, #f39c12)'; }

        notification.innerHTML = `<div style="display: flex; align-items: center; gap: 12px;"><i class="${icon}" style="font-size: 1.4rem;"></i><span style="font-size: 0.95rem; font-weight: 600;">${escapeHtml(message)}</span></div>`;
        Object.assign(notification.style, {
            position: 'fixed', top: '20px', right: '20px', zIndex: '10000',
            background: bgStyle, color: '#fff', padding: '16px 24px',
            borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
            fontFamily: "'Inter', sans-serif", minWidth: '300px', maxWidth: '400px',
            animation: 'slideInRight 0.4s ease-out forwards',
            pointerEvents: 'auto', cursor: 'pointer'
        });
        
        notification.onclick = () => notification.remove();
        document.body.appendChild(notification);
        setTimeout(() => { if (notification.parentElement) notification.remove(); }, 6000);
    }

    // ==========================================
    // FORMATTERS & CONSTANTS
    // ==========================================
    function formatCompactNumber(num) {
        if (num === null || num === undefined || isNaN(num)) return '0';
        num = parseFloat(num);
        if (num === 0) return '0';
        const sign = num < 0 ? '-' : '';
        const absNum = Math.abs(num);
        let formattedNumber;
        let suffix = '';
        if (absNum >= 10000000) { formattedNumber = absNum / 10000000; suffix = ' Cr'; } 
        else if (absNum >= 100000) { formattedNumber = absNum / 100000; suffix = ' Lakh'; } 
        else if (absNum >= 1000) { formattedNumber = absNum / 1000; suffix = 'K'; } 
        else { formattedNumber = absNum; suffix = ''; }
        return sign + parseFloat(formattedNumber.toFixed(2)) + suffix;
    }

    const CATEGORIES = {
        student: [
            { value: 'tuition', label: 'Tuition Fees', icon: 'ri-graduation-cap-line' },
            { value: 'books', label: 'Books & Supplies', icon: 'ri-book-open-line' },
            { value: 'housing', label: 'Housing/Dorm', icon: 'ri-home-4-line' },
            { value: 'food', label: 'Food & Dining', icon: 'ri-restaurant-line' },
            { value: 'transport', label: 'Transportation', icon: 'ri-bus-line' },
            { value: 'mobile', label: 'Mobile & Internet', icon: 'ri-smartphone-line' },
            { value: 'entertainment', label: 'Entertainment', icon: 'ri-movie-line' },
            { value: 'personal', label: 'Personal Care', icon: 'ri-user-smile-line' },
            { value: 'subscriptions', label: 'Subscriptions', icon: 'ri-netflix-line' },
            { value: 'travel', label: 'Travel/Vacation', icon: 'ri-plane-line' },
            { value: 'stationery', label: 'Stationery & Print', icon: 'ri-pencil-ruler-2-line' },
            { value: 'electronics', label: 'Electronics/Gadgets', icon: 'ri-computer-line' },
            { value: 'others', label: 'Miscellaneous', icon: 'ri-more-fill' }
        ],
        individual: [
            { value: 'housing', label: 'Rent/Mortgage', icon: 'ri-home-line' },
            { value: 'groceries', label: 'Groceries', icon: 'ri-shopping-cart-2-line' },
            { value: 'utilities', label: 'Utilities (Elec/Water)', icon: 'ri-lightbulb-line' },
            { value: 'transport', label: 'Transportation/Fuel', icon: 'ri-gas-station-line' },
            { value: 'insurance', label: 'Insurance', icon: 'ri-shield-check-line' },
            { value: 'healthcare', label: 'Healthcare & Medical', icon: 'ri-pulse-line' },
            { value: 'dining', label: 'Dining Out', icon: 'ri-goblet-line' },
            { value: 'shopping', label: 'Shopping/Clothing', icon: 'ri-t-shirt-line' },
            { value: 'entertainment', label: 'Entertainment', icon: 'ri-gamepad-line' },
            { value: 'personal', label: 'Personal Care', icon: 'ri-user-star-line' },
            { value: 'education', label: 'Education/Courses', icon: 'ri-book-read-line' },
            { value: 'debt', label: 'Debt/Loan Repayment', icon: 'ri-bank-card-line' },
            { value: 'investment', label: 'Investments/Savings', icon: 'ri-funds-box-line' },
            { value: 'charity', label: 'Donations/Charity', icon: 'ri-heart-line' },
            { value: 'others', label: 'Miscellaneous', icon: 'ri-more-fill' }
        ],
        business: [
            { value: 'payroll', label: 'Payroll & Salaries', icon: 'ri-team-line' },
            { value: 'rent', label: 'Office Rent/Lease', icon: 'ri-building-4-line' },
            { value: 'inventory', label: 'Inventory/COGS', icon: 'ri-stack-line' },
            { value: 'marketing', label: 'Marketing & Ads', icon: 'ri-megaphone-line' },
            { value: 'software', label: 'Software & Tools', icon: 'ri-code-s-slash-line' },
            { value: 'utilities', label: 'Office Utilities', icon: 'ri-flashlight-line' },
            { value: 'travel', label: 'Business Travel', icon: 'ri-briefcase-line' },
            { value: 'maintenance', label: 'Repairs & Maintenance', icon: 'ri-tools-line' },
            { value: 'insurance', label: 'Business Insurance', icon: 'ri-shield-keyhole-line' },
            { value: 'legal', label: 'Legal & Professional', icon: 'ri-scales-3-line' },
            { value: 'taxes', label: 'Taxes & Licenses', icon: 'ri-government-line' },
            { value: 'logistics', label: 'Shipping & Logistics', icon: 'ri-truck-line' },
            { value: 'equipment', label: 'Equipment & Hardware', icon: 'ri-printer-line' },
            { value: 'others', label: 'Miscellaneous', icon: 'ri-more-fill' }
        ]
    };

    const INCOME_SOURCES = {
        student: [ { value: 'scholarship', label: 'Scholarship', icon: 'ri-award-line' }, { value: 'family', label: 'Family Support', icon: 'ri-parent-line' }, { value: 'parttime', label: 'Part-time Job', icon: 'ri-briefcase-line' }, { value: 'freelance', label: 'Freelancing', icon: 'ri-macbook-line' }, { value: 'internship', label: 'Internship', icon: 'ri-id-card-line' }, { value: 'awards', label: 'Awards/Grants', icon: 'ri-trophy-line' } ],
        individual: [ { value: 'salary', label: 'Salary', icon: 'ri-wallet-3-line' }, { value: 'freelance', label: 'Freelancing', icon: 'ri-macbook-line' }, { value: 'investment', label: 'Investments', icon: 'ri-line-chart-line' }, { value: 'business', label: 'Side Business', icon: 'ri-store-2-line' }, { value: 'rental', label: 'Rental Income', icon: 'ri-key-2-line' }, { value: 'bonus', label: 'Bonus', icon: 'ri-gift-line' } ],
        business: [ { value: 'sales', label: 'Sales Revenue', icon: 'ri-shopping-bag-3-line' }, { value: 'services', label: 'Service Income', icon: 'ri-customer-service-2-line' }, { value: 'invoices', label: 'Client Invoices', icon: 'ri-file-list-3-line' }, { value: 'investment', label: 'Capital Gains', icon: 'ri-funds-line' }, { value: 'credits', label: 'Tax Credits', icon: 'ri-percent-line' } ]
    };

    function getCategoryLabel(val, type) { 
        const cats = CATEGORIES[type] || CATEGORIES.individual; 
        const f = cats.find(c => c.value === val); 
        return f ? f.label : val; 
    }

    function getCategoryIcon(val, type) { 
        const cats = CATEGORIES[type] || CATEGORIES.individual; 
        const f = cats.find(c => c.value === val); 
        return f ? f.icon : 'ri-question-line'; 
    }

    function getIncomeIcon(val, type) { 
        const sources = INCOME_SOURCES[type] || INCOME_SOURCES.individual; 
        const f = sources.find(s => s.value === val); 
        return f ? f.icon : 'ri-money-dollar-circle-line'; 
    }

    function populateCategoryDropdowns() {
        const userType = currentUserType || 'individual';
        const cats = CATEGORIES[userType];
        const opts = '<option value="">Select...</option>' + cats.map(c => `<option value="${c.value}">${c.label}</option>`).join('');
        
        ['category', 'recCategory', 'budgetCategory'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.innerHTML = opts;
        });
        
        const sources = INCOME_SOURCES[userType];
        const incOpts = '<option value="">Select...</option>' + sources.map(s => `<option value="${s.value}">${s.label}</option>`).join('');
        const incEl = document.getElementById('incomeSource');
        if(incEl) incEl.innerHTML = incOpts;
    }

    // ==========================================
    // UI LOGIC
    // ==========================================
    function showLoggedInUI() {
        const authWrapper = document.getElementById('authWrapper');
        const appWrapper = document.getElementById('appWrapper');
        
        document.body.classList.remove('type-student', 'type-individual', 'type-business');
        if (currentUserType) {
            document.body.classList.add(`type-${currentUserType}`);
        }
        
        if (authWrapper) authWrapper.style.display = 'none';
        
        // Display Logic
        if (appWrapper) {
             appWrapper.style.removeProperty('display'); 
             if(window.innerWidth > 900) appWrapper.style.display = 'grid';
             else appWrapper.style.display = 'block';

             // === THE FIX: Populate Mobile Profile Data ===
             if(document.getElementById('menuUsernameMobile')) {
                 document.getElementById('menuUsernameMobile').textContent = currentUser;
                 document.getElementById('menuUserEmailMobile').textContent = currentEmail;
                 document.getElementById('avatarInitialsMobile').textContent = currentUser ? currentUser.charAt(0).toUpperCase() : 'U';
                 
                 const mbBadge = document.getElementById('menuUserTypeBadgeMobile');
                 if(mbBadge) {
                     mbBadge.textContent = currentUserType;
                     mbBadge.className = 'badge'; 
                     mbBadge.classList.add(`type-${currentUserType}`);
                 }
             }
        }
        
        // Populate Desktop/Original Profile Data
        if(document.getElementById('menuUsername')) document.getElementById('menuUsername').textContent = currentUser;
        if(document.getElementById('menuUserEmail')) document.getElementById('menuUserEmail').textContent = currentEmail;
        if(document.getElementById('avatarInitials')) document.getElementById('avatarInitials').textContent = currentUser ? currentUser.charAt(0).toUpperCase() : 'U';
        
        const badge = document.getElementById('menuUserTypeBadge');
        if(badge) {
            badge.textContent = currentUserType;
            badge.className = 'badge'; 
            badge.classList.add(`type-${currentUserType}`);
        }
        
        const dateDisplay = document.getElementById('currentDateDisplay');
        if (dateDisplay) {
            const dateOptions = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
            dateDisplay.textContent = new Date().toLocaleDateString('en-US', dateOptions);
        }

        const isAdmin = localStorage.getItem('isAdmin') === 'true';
        const adminBtn = document.getElementById('adminNavBtn');
        if(adminBtn) adminBtn.style.display = isAdmin ? 'flex' : 'none';

        populateCategoryDropdowns();
    }

    function showLoginUI() {
        const authWrapper = document.getElementById('authWrapper');
        const appWrapper = document.getElementById('appWrapper');
        
        // FIX: Force hide the dashboard when logged out using !important
        if (appWrapper) appWrapper.style.setProperty('display', 'none', 'important');
        
        if (authWrapper) {
            authWrapper.style.display = 'flex';
            showAuthTab('login');
        }
    }

    // Exported for onclick
    window.showAuthTab = function(tab) {
        document.querySelectorAll('.auth-box').forEach(el => el.classList.remove('active'));
        const target = document.getElementById(tab);
        if(target) target.classList.add('active');
    };

  window.showTab = function(tabName) {
        // 1. Security Check
        if (!currentToken && tabName !== 'login' && tabName !== 'register') {
            showLoginUI(); return;
        }
        
        // 2. Active Tab State
        if (currentToken && tabName !== 'login' && tabName !== 'register') {
            localStorage.setItem('activeTab', tabName);
        }

        // 3. Switch UI Sections
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        const target = document.getElementById(tabName);
        if(target) target.classList.add('active');
        
        // 4. Update Navigation State
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
        if(navItem) navItem.classList.add('active');
        
        // 5. Update Page Title
        const titleMap = { 'dashboard': 'Dashboard', 'add-income': 'Income', 'add-expense': 'Expenses', 'budget': 'Budgets', 'analysis': 'Analytics', 'recurring': 'Subscriptions', 'emergency-fund': 'Emergency Fund', 'admin-panel': 'Admin Dashboard' };
        const pageTitle = document.getElementById('pageTitle');
        if(pageTitle) pageTitle.textContent = titleMap[tabName] || 'SpendWise';

        // === THE FIX: Toggle Month Picker Visibility ===
        const picker = document.getElementById('monthPickerContainer');
        if(picker) {
            // Only show flex if tab is dashboard, otherwise hide
            picker.style.display = (tabName === 'dashboard') ? 'flex' : 'none';
        }

        // 6. Load Data for Specific Tab
        if (tabName === 'dashboard') { 
            const mInput = document.getElementById('dashboardMonthInput');
            loadDashboard(mInput ? mInput.value : null); 
        }
        else if (tabName === 'add-expense') loadExpenses();
        else if (tabName === 'analysis') loadAnalysis();
        else if (tabName === 'add-income') loadRecentIncome();
        else if (tabName === 'budget') loadBudgets();
        else if (tabName === 'emergency-fund') loadEmergencyFund();
        else if (tabName === 'recurring') loadRecurringExpenses();
        else if (tabName === 'admin-panel') loadAdminData();
    };

    // Exported for onclick
    window.toggleSidebar = function() {
        const sidebar = document.querySelector('.sidebar');
        if(sidebar) sidebar.classList.toggle('active');
    };

    // ==========================================
    // CORE DATA FUNCTIONS
    // ==========================================
    async function loadDashboard(month) {
        if(!currentToken) return;
        const m = month || new Date().toISOString().slice(0, 7);
        try {
            const [dashRes, trendRes] = await Promise.all([
                fetch(`${CONFIG.API_BASE}/dashboard?month=${m}`, { headers: {'Authorization': `Bearer ${currentToken}`} }),
                fetch(`${CONFIG.API_BASE}/analytics/monthly`, { headers: {'Authorization': `Bearer ${currentToken}`} })
            ]);
            
            if(!dashRes.ok || !trendRes.ok) throw new Error("Failed to load data");

            const d = await dashRes.json();
            const t = await trendRes.json();
            
            const incomeEl = document.getElementById('totalIncomeDisplay');
            const expenseEl = document.getElementById('totalExpensesDisplay');
            const savingsEl = document.getElementById('netSavingsDisplay');
            const rateEl = document.getElementById('savingsRateDisplay');

            if(incomeEl) incomeEl.textContent = `₹${formatCompactNumber(d.total_income)}`;
            if(expenseEl) expenseEl.textContent = `₹${formatCompactNumber(d.total_expenses)}`;
            if(savingsEl) savingsEl.textContent = `₹${formatCompactNumber(d.net_savings)}`;
            if(rateEl) rateEl.textContent = `${d.savings_rate.toFixed(1)}%`;
            
            if(d.category_expenses && t) renderCharts(d.category_expenses, t);
            
            const list = document.getElementById('recentTransactionsList');
            if(list) {
                // FIXED XSS HERE
                list.innerHTML = d.recent_transactions.map(tr => `
                    <div class="transaction-item">
                        <div class="t-icon"><i class="${getCategoryIcon(tr.category, currentUserType)}"></i></div>
                        <div class="t-info">
                            <div class="t-title">${escapeHtml(getCategoryLabel(tr.category, currentUserType))}</div>
                            <div class="t-meta">${escapeHtml(tr.description || 'Expense')} • ${tr.date}</div>
                        </div>
                        <div class="t-amount neg">-₹${formatCompactNumber(tr.amount)}</div>
                    </div>
                `).join('') || '<div style="padding:20px; text-align:center; opacity:0.6;">No recent transactions</div>';
            }

            // Populate smart insights for both Desktop and Mobile panels
            const insightsHTML = (d.savings_rate < 0) ? `<div class="insight-card"><i class="ri-alarm-warning-line"></i> <div><strong>Overspending</strong><br><span style="opacity:0.7">Expenses > Income</span></div></div>` :
                                 (d.savings_rate < 20) ? `<div class="insight-card"><i class="ri-funds-line"></i> <div><strong>Low Savings</strong><br><span style="opacity:0.7">Aim for 20%</span></div></div>` :
                                 `<div class="insight-card"><i class="ri-thumb-up-line"></i> <div><strong>Healthy</strong><br><span style="opacity:0.7">Good savings rate!</span></div></div>`;

            // Update desktop panel
            const insights = document.getElementById('userTypeInsights');
            if(insights) insights.innerHTML = insightsHTML;

            // Update mobile panel if exists (since we copied HTML, IDs might duplicate. Ideally use class, but HTML copy is safer for now)
            // A better approach in HTML would be to use classes, but since we have duplicate IDs for the mobile view hack:
            // Let's rely on the fact that the mobile view is visible.
        } catch (error) {
            console.error("Dashboard Error:", error);
            showNotification("Failed to load dashboard data", "danger");
        }
    }

    function renderCharts(categoryData, trendData) {
        const isLight = document.body.classList.contains('light-mode');
        const gridColor = isLight ? '#E5E7EB' : '#27272a';

        if (categoryChartInstance) { categoryChartInstance.destroy(); categoryChartInstance = null; }
        if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance = null; }

        const catCanvas = document.getElementById('categoryChart');
        if(catCanvas) {
            const ctxCat = catCanvas.getContext('2d');
            categoryChartInstance = new Chart(ctxCat, {
                type: 'doughnut',
                data: {
                    // Safe, as chart.js handles label rendering
                    labels: categoryData.map(c => c.category),
                    datasets: [{
                        data: categoryData.map(c => c.amount),
                        backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { color: '#9ca3af', font: { family: 'Inter' } } },
                        tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${formatCompactNumber(ctx.raw)}` } }
                    },
                    cutout: '70%'
                }
            });
        }

        const trendCanvas = document.getElementById('trendChart');
        if(trendCanvas) {
            const ctxTrend = trendCanvas.getContext('2d');
            trendChartInstance = new Chart(ctxTrend, {
                type: 'line',
                data: {
                    labels: trendData.map(t => t.month), 
                    datasets: [
                        { label: 'Income', data: trendData.map(t => t.income), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 2, fill: true, tension: 0.4 },
                        { label: 'Expenses', data: trendData.map(t => t.expenses), borderColor: '#ef4444', borderWidth: 2, tension: 0.4 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: { 
                        legend: { labels: { color: '#9ca3af' } },
                        tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${formatCompactNumber(ctx.raw)}` } }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: '#6b7280' } },
                        y: { grid: { color: gridColor }, ticks: { color: '#6b7280', callback: (val) => formatCompactNumber(val) } }
                    }
                }
            });
        }
    }
async function loadAdminData() {
        if (!currentToken) return;
        
        try {
            // 1. Get Stats
            const resStats = await fetch(`${CONFIG.API_BASE}/admin/stats`, { 
                headers: {'Authorization': `Bearer ${currentToken}`} 
            });
            
            if (resStats.status === 403) {
                showNotification("Access Denied: You are not an Admin", "danger");
                return;
            }

            const stats = await resStats.json();
            
            // 2. Update Boxes
            document.getElementById('adminTotalUsers').textContent = stats.total_users || 0;
            document.getElementById('adminTotalVol').textContent = `₹${formatCompactNumber(stats.total_volume || 0)}`;
            document.getElementById('adminTotalFeed').textContent = stats.total_feedback || 0;
            
            // 3. Get Users List
            const resUsers = await fetch(`${CONFIG.API_BASE}/admin/users`, { 
                headers: {'Authorization': `Bearer ${currentToken}`} 
            });
            const users = await resUsers.json();
            
            const userList = document.getElementById('adminUserList');
            if(userList) {
                userList.innerHTML = users.map(u => `
                    <div class="transaction-item">
                        <div class="t-info">
                            <div class="t-title">${escapeHtml(u.username)} ${u.is_admin ? '<span style="color:#ec4899; font-weight:bold">(ADMIN)</span>' : ''}</div>
                            <div class="t-meta">${escapeHtml(u.email)} • ${u.user_type}</div>
                        </div>
                        <div class="t-amount" style="font-size:0.8rem; opacity:0.6">${u.joined}</div>
                    </div>
                `).join('') || '<p style="text-align:center; padding:20px;">No users found.</p>';
            }

            // 4. Get Feedback List
            const resFeed = await fetch(`${CONFIG.API_BASE}/admin/feedback`, { 
                headers: {'Authorization': `Bearer ${currentToken}`} 
            });
            const feeds = await resFeed.json();
            
            const feedList = document.getElementById('adminFeedbackList');
            if(feedList) {
                feedList.innerHTML = feeds.map(f => `
                    <div class="transaction-item">
                        <div class="t-info">
                            <div class="t-title">Rating: ${f.rating}/5</div>
                            <div class="t-meta">"${escapeHtml(f.message)}"</div>
                        </div>
                        <div class="t-amount" style="font-size:0.8rem; opacity:0.6">${f.date}</div>
                    </div>
                `).join('') || '<p style="text-align:center; padding:20px;">No feedback yet.</p>';
            }
        } catch (e) {
            console.error("Admin Load Error:", e);
        }
    }

    async function loadExpenses() {
        if (!currentToken) return;
        const res = await fetch(`${CONFIG.API_BASE}/expenses`, { headers: {'Authorization': `Bearer ${currentToken}`} });
        const data = await res.json();
        const list = document.getElementById('allExpensesList');
        if(list) {
            // FIXED XSS HERE
            list.innerHTML = data.map(e => `
                <div class="transaction-item">
                    <div class="t-info"><div class="t-title">${escapeHtml(e.category)}</div><div class="t-meta">${e.date} • ${escapeHtml(e.description)}</div></div>
                    <div class="t-amount neg">-₹${formatCompactNumber(e.amount)}</div>
                    <button class="btn-text" style="color:#ef4444; margin-left:10px;" onclick="window.deleteExpense(${e.id})"><i class="ri-delete-bin-line"></i></button>
                </div>
            `).join('') || '<div style="padding:20px; text-align:center; opacity:0.6;">No expenses found</div>';
        }
    }

  async function addExpense() {
        const amt = document.getElementById('amount').value;
        const cat = document.getElementById('category').value;
        const date = document.getElementById('date').value;
        const method = document.getElementById('paymentMethod').value;
        const desc = document.getElementById('description').value;
        
        await fetch(`${CONFIG.API_BASE}/expenses`, { method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}`}, body: JSON.stringify({amount: amt, category: cat, date: date, payment_method: method, description: desc}) });
        
        showNotification('Expense Added', 'success');
        document.getElementById('expenseForm').reset();
        loadExpenses();
        
        // === THE FIX: Refresh Calendar if it is open ===
        if(document.getElementById('calendarModal').style.display === 'block') {
            await fetchAllExpensesForCalendar();
            renderCalendar();
        }
    }

    window.deleteExpense = async function(id) {
        if(confirm('Delete?')) {
            await fetch(`${CONFIG.API_BASE}/expenses/${id}`, { method: 'DELETE', headers: {'Authorization': `Bearer ${currentToken}`} });
            loadExpenses();
            
            if(document.getElementById('dashboard').classList.contains('active')) loadDashboard();
            showNotification('Deleted', 'success');
            
            // === THE FIX: Refresh Calendar if it is open ===
            if(document.getElementById('calendarModal').style.display === 'block') {
                await fetchAllExpensesForCalendar();
                renderCalendar();
            }
        }
    };

    async function addIncome() {
        const amt = document.getElementById('incomeAmount').value;
        const src = document.getElementById('incomeSource').value;
        const date = document.getElementById('incomeDate').value;
        await fetch(`${CONFIG.API_BASE}/income`, { method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}`}, body: JSON.stringify({amount: amt, source: src, date: date}) });
        showNotification('Income Added', 'success');
        loadRecentIncome();
    }

    async function loadRecentIncome() {
        const res = await fetch(`${CONFIG.API_BASE}/income`, { headers: {'Authorization': `Bearer ${currentToken}`} });
        const data = await res.json();
        const list = document.getElementById('recentIncomeList');
        if(list) {
            // FIXED XSS HERE
            list.innerHTML = data.map(i => `
                <div class="transaction-item">
                    <div class="t-info"><div class="t-title">${escapeHtml(i.source)}</div><div class="t-meta">${i.date}</div></div>
                    <div class="t-amount pos">+₹${formatCompactNumber(i.amount)}</div>
                </div>
            `).join('') || '<div style="padding:20px; text-align:center; opacity:0.6;">No income records</div>';
        }
    }

    async function loadBudgets() {
        const m = document.getElementById('budgetMonth')?.value || new Date().toISOString().slice(0, 7);
        const [bRes, aRes] = await Promise.all([
            fetch(`${CONFIG.API_BASE}/budget?month=${m}`, { headers: {'Authorization': `Bearer ${currentToken}`} }),
            fetch(`${CONFIG.API_BASE}/budget-analysis?month=${m}`, { headers: {'Authorization': `Bearer ${currentToken}`} })
        ]);
        const budgets = await bRes.json();
        const analysis = await aRes.json();
        
        const bList = document.getElementById('currentBudgetsList');
        if(bList) {
            // FIXED XSS HERE
            bList.innerHTML = budgets.map(b => `<div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid var(--border-color);"><span><i class="${getCategoryIcon(b.category, currentUserType)}" style="margin-right:8px"></i>${escapeHtml(getCategoryLabel(b.category, currentUserType))}</span><span style="color:#10b981;">₹${formatCompactNumber(b.amount)}</span></div>`).join('') || '<div style="padding:15px; opacity:0.6;">No budgets set</div>';
        }
        
        const aList = document.getElementById('budgetAnalysisList');
        if(aList) {
            // FIXED XSS HERE
            aList.innerHTML = analysis.map(b => {
                const pct = Math.min((b.actual/b.budgeted*100), 100);
                const col = b.status === 'over' ? '#ef4444' : '#10b981';
                return `<div style="margin-bottom:15px;"><div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:5px;"><span><i class="${getCategoryIcon(b.category, currentUserType)}" style="margin-right:5px"></i>${escapeHtml(getCategoryLabel(b.category, currentUserType))}</span><span>${pct.toFixed(0)}%</span></div><div class="progress-container"><div class="progress-fill" style="width:${pct}%; background:${col}"></div></div></div>`;
            }).join('') || '<div style="padding:15px; opacity:0.6;">No data</div>';
        }
    }

    async function setBudget() {
        const cat = document.getElementById('budgetCategory').value;
        const amt = document.getElementById('budgetAmount').value;
        const m = document.getElementById('budgetMonth').value;
        await fetch(`${CONFIG.API_BASE}/budget`, { method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}`}, body: JSON.stringify({category:cat, amount:amt, month:m})});
        showNotification('Budget Set', 'success'); loadBudgets();
    }

    async function loadRecurringExpenses() {
        const res = await fetch(`${CONFIG.API_BASE}/recurring`, { headers: {'Authorization': `Bearer ${currentToken}`} });
        const data = await res.json();
        const list = document.getElementById('recurringList');
        if(list) {
            // FIXED XSS HERE
            list.innerHTML = data.map(r => `
                <div class="transaction-item">
                    <div class="t-info"><div class="t-title">${escapeHtml(r.description)}</div><div class="t-meta">Due: ${r.next_due_date} • ${r.frequency}</div></div>
                    <div class="t-amount">-₹${formatCompactNumber(r.amount)}</div>
                    <button class="btn-text" style="color:#ef4444; margin-left:10px;" onclick="window.deleteRecurring(${r.id})">Stop</button>
                </div>
            `).join('') || '<div style="padding:15px; opacity:0.6;">No active subscriptions</div>';
        }
    }

    // Exported for onclick
    window.addRecurringExpense = async function() {
        const d = document.getElementById('recDescription').value;
        const a = document.getElementById('recAmount').value;
        const c = document.getElementById('recCategory').value;
        const date = document.getElementById('recDate').value;
        const f = document.getElementById('recFrequency').value;
        await fetch(`${CONFIG.API_BASE}/recurring`, { method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}`}, body: JSON.stringify({description:d, amount:a, category:c, next_due_date:date, frequency:f})});
        showNotification('Added', 'success'); loadRecurringExpenses();
    };

    // Exported for onclick
    window.deleteRecurring = async function(id) {
        if(confirm('Stop?')) {
            await fetch(`${CONFIG.API_BASE}/recurring/${id}`, { method: 'DELETE', headers: {'Authorization': `Bearer ${currentToken}`} });
            loadRecurringExpenses();
            showNotification('Stopped', 'success');
        }
    };

  async function loadEmergencyFund() {
    console.log("Starting loadEmergencyFund...");

    try {
        const res = await fetch(`${getApiBase()}/emergency-fund`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (!res.ok) return;

        const data = await res.json();
        console.log("Fund Data:", data);

        // =========================================================
        // 1. UPDATE TOP CARDS (Using the New IDs)
        // =========================================================
        // Current Fund
        const currentEl = document.getElementById('fundDisplayCurrent');
        if(currentEl) currentEl.innerText = `₹${data.current_amount.toLocaleString()}`;

        // Goal Target
        const targetEl = document.getElementById('fundDisplayTarget');
        if(targetEl) targetEl.innerText = `₹${data.target_amount.toLocaleString()}`;

        // Progress Text (Top Card)
        const progressEl = document.getElementById('fundDisplayProgress');
        if(progressEl) progressEl.innerText = `${data.progress_percentage}%`;

        // =========================================================
        // 2. UPDATE PROGRESS BARS & INPUTS
        // =========================================================
        // Progress Ring Text (if you have a circle chart)
        const ringText = document.querySelector('.progress-ring-text');
        if(ringText) ringText.innerText = `${data.progress_percentage}%`;

        // Linear Progress Bar (The blue line)
        const bar = document.getElementById('fundProgressBar');
        if(bar) bar.style.width = `${data.progress_percentage}%`;

        // Form Inputs (The text boxes at bottom)
        if(document.getElementById('targetAmount')) document.getElementById('targetAmount').value = data.target_amount;
        if(document.getElementById('currentAmount')) document.getElementById('currentAmount').value = data.current_amount;
        if(document.getElementById('alertThreshold')) document.getElementById('alertThreshold').value = data.alert_threshold;
        if(document.getElementById('monthlyGoal')) document.getElementById('monthlyGoal').value = data.monthly_goal;

        // =========================================================
        // 3. UPDATE STATUS MESSAGES
        // =========================================================
        const alertEl = document.getElementById('fund-alert-msg');
        const goalEl = document.getElementById('fund-goal-msg');

        if (alertEl && goalEl) {
            // Status Check
            if (data.current_amount < data.alert_threshold) {
                alertEl.innerText = `⚠️ Alert: Your fund is BELOW the safety threshold of ₹${data.alert_threshold.toLocaleString()}!`;
                alertEl.style.color = '#ff5252'; 
            } else {
                alertEl.innerText = `✅ Healthy: You are safely above your ₹${data.alert_threshold.toLocaleString()} threshold.`;
                alertEl.style.color = '#4caf50'; 
            }

            // Timeline Calculation
            const remaining = data.target_amount - data.current_amount;
            if (remaining <= 0) {
                goalEl.innerText = "🎉 Congratulations! You have reached your target goal!";
                goalEl.style.color = "#FFD700";
            } else if (data.monthly_goal > 0) {
                const monthsLeft = Math.ceil(remaining / data.monthly_goal);
                goalEl.innerText = `💡 Insight: At ₹${data.monthly_goal.toLocaleString()}/month, you will reach your goal in approximately ${monthsLeft} months.`;
                goalEl.style.color = "#ccc";
            } else {
                goalEl.innerText = "💡 Set a monthly goal to see your completion timeline.";
                goalEl.style.color = "#888";
            }
        }
        
    } catch (error) {
        console.error("Error loading fund:", error);
    }
}

    async function setEmergencyFund() {
        const t = document.getElementById('targetAmount').value;
        const c = document.getElementById('currentAmount').value;
        const a = document.getElementById('alertThreshold').value;
        const m = document.getElementById('monthlyGoal').value;
        await fetch(`${CONFIG.API_BASE}/emergency-fund`, { method: 'PUT', headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}`}, body: JSON.stringify({target_amount:t, current_amount:c, alert_threshold:a, monthly_goal:m})});
        showNotification('Updated', 'success'); loadEmergencyFund();
    }

    // ==========================================
    // UPDATED: LOAD ANALYSIS FUNCTION
    // ==========================================
      async function loadAnalysis() {
        if (!currentToken) return;
        const m = new Date().toISOString().slice(0, 7);
        
        try {
            const [dashRes, trendRes] = await Promise.all([
                fetch(`${CONFIG.API_BASE}/dashboard?month=${m}`, { headers: {'Authorization': `Bearer ${currentToken}`} }),
                fetch(`${CONFIG.API_BASE}/analytics/monthly`, { headers: {'Authorization': `Bearer ${currentToken}`} })
            ]);

            if(!dashRes.ok || !trendRes.ok) throw new Error("Failed to load analysis data");

            const d = await dashRes.json();
            const t = await trendRes.json();

            // 1. Populate Summary Table
            document.getElementById('reportIncome').textContent = `₹${formatCompactNumber(d.total_income)}`;
            document.getElementById('reportExpenses').textContent = `₹${formatCompactNumber(d.total_expenses)}`;
            document.getElementById('reportSavings').textContent = `₹${formatCompactNumber(d.net_savings)}`;
            document.getElementById('reportRate').textContent = `${d.savings_rate.toFixed(1)}%`;

            // 2. Populate Category Breakdown (List view)
            const catContainer = document.getElementById('categoryAnalysis');
            if (catContainer) {
                if (d.category_expenses && d.category_expenses.length > 0) {
                    // FIXED XSS HERE
                    catContainer.innerHTML = d.category_expenses.map(c => `
                        <div style="margin-bottom: 12px;">
                            <div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:4px;">
                                <span>${escapeHtml(c.category)}</span>
                                <span>₹${formatCompactNumber(c.amount)} (${c.percentage}%)</span>
                            </div>
                            <div class="progress-container" style="height:6px;">
                                <div class="progress-fill" style="width:${c.percentage}%; background-color: var(--primary);"></div>
                            </div>
                        </div>
                    `).join('');
                } else {
                    catContainer.innerHTML = '<p style="opacity:0.6; text-align:center;">No expenses this month.</p>';
                }
            }

            // 3. Populate Trend Analysis (List view of last 6 months)
            const trendContainer = document.getElementById('trendAnalysis');
            if (trendContainer) {
                const recentTrend = t.slice(0, 6); 
                trendContainer.innerHTML = recentTrend.map(m => `
                    <div style="display:flex; justify-content:space-between; padding: 10px 0; border-bottom: 1px solid var(--border-color);">
                        <span style="color:var(--text-muted);">${m.month}</span>
                        <div style="text-align:right;">
                            <div style="font-size:0.9rem; color:var(--success);">+${formatCompactNumber(m.income)}</div>
                            <div style="font-size:0.9rem; color:var(--danger);">- ${formatCompactNumber(m.expenses)}</div>
                        </div>
                    </div>
                `).join('');
            }

        } catch (e) {
            console.error(e);
            showNotification('Failed to load analysis', 'danger');
        }
    }

    // ==========================================
    // CALENDAR (ENHANCED DROPDOWN)
    // ==========================================
    let calendarExpenses = [];

    // Exported for onclick
    window.openCalendarModal = async function() {
        const modal = document.getElementById('calendarModal');
        if(modal) {
            modal.style.display = 'block';
            const now = new Date();
            document.getElementById('calendarMonth').value = now.getMonth();
            document.getElementById('calendarYear').value = now.getFullYear();
            await fetchAllExpensesForCalendar();
            renderCalendar();
        }
    };

    // Exported for onclick
    window.closeCalendarModal = function() {
        const modal = document.getElementById('calendarModal');
        if(modal) modal.style.display = 'none';
        const details = document.getElementById('calendarDetails');
        if(details) details.innerHTML = '';
    };

    async function fetchAllExpensesForCalendar() {
        if (!currentToken) return;
        try {
            const res = await fetch(`${CONFIG.API_BASE}/expenses`, { headers: {'Authorization': `Bearer ${currentToken}`} });
            calendarExpenses = await res.json();
        } catch (e) { console.error(e); }
    }

    // Exported for onchange in HTML
    window.renderCalendar = function() {
        const month = parseInt(document.getElementById('calendarMonth').value);
        const year = parseInt(document.getElementById('calendarYear').value);
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay(); 
        
        const grid = document.getElementById('calendarGrid');
        if(!grid) return;
        grid.innerHTML = '';
        
        for (let i = 0; i < startingDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'calendar-day empty';
            grid.appendChild(emptyCell);
        }
        
        for (let day = 1; day <= daysInMonth; day++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day';
            cell.textContent = day;
            
            const currentIdsStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayExpenses = calendarExpenses.filter(e => e.date === currentIdsStr);
            
            if (dayExpenses.length > 0) { 
                cell.classList.add('has-expense'); 
                cell.title = `${dayExpenses.length} transaction(s)`; 
                cell.onclick = function() {
                    document.querySelectorAll('.calendar-day').forEach(c => c.classList.remove('selected'));
                    cell.classList.add('selected');
                    showCalendarDetails(currentIdsStr, dayExpenses);
                };
            }
            grid.appendChild(cell);
        }
    };

    function showCalendarDetails(dateStr, expenses) {
        const container = document.getElementById('calendarDetails');
        if(!container) return;
        container.innerHTML = '';
        
        const detailBox = document.createElement('div');
        Object.assign(detailBox.style, {
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '12px',
            marginTop: '20px',
            overflow: 'hidden',
            border: '1px solid var(--border-color)',
            animation: 'fadeIn 0.3s ease',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        });

        const formattedDate = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        
        const header = document.createElement('div');
        header.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;">
            <h4 style="margin:0; font-size: 0.95rem; color: #9ca3af; font-family: var(--font-header);">${formattedDate}</h4>
            <span style="font-size:0.8rem; background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:10px;">${expenses.length} Entries</span>
        </div>`;
        Object.assign(header.style, {
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(0,0,0,0.2)'
        });
        detailBox.appendChild(header);

        const list = document.createElement('div');
        if (expenses.length === 0) {
            list.innerHTML = `<p style="padding: 20px; text-align: center; color: #666; font-size: 0.9rem;">No expenses recorded.</p>`;
        } else {
            expenses.forEach(exp => {
                const item = document.createElement('div');
                const timeOrDesc = exp.description || 'Expense'; 
                
                // FIXED XSS HERE
                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(79, 70, 229, 0.1); color: #4f46e5; display: flex; align-items: center; justify-content: center;">
                                <i class="${getCategoryIcon(exp.category, currentUserType)}"></i>
                            </div>
                            <div>
                                <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-main);">${escapeHtml(getCategoryLabel(exp.category, currentUserType))}</div>
                                <div style="font-size: 0.8rem; color: #9ca3af;">${escapeHtml(timeOrDesc)}</div>
                            </div>
                        </div>
                        <div style="font-weight: 600; color: #ef4444; font-family: var(--font-header);">-₹${formatCompactNumber(exp.amount)}</div>
                    </div>
                `;
                Object.assign(item.style, {
                    padding: '16px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    transition: 'background 0.2s'
                });
                item.onmouseenter = () => item.style.background = 'rgba(255,255,255,0.02)';
                item.onmouseleave = () => item.style.background = 'transparent';
                
                list.appendChild(item);
            });
        }
        detailBox.appendChild(list);
        container.appendChild(detailBox);
    }

    // ==========================================
    // AUTH & ACCOUNT
    // ==========================================
    
    // Helper function for password validation
    function isValidPassword(p) {
        if (p.length < 8) return { valid: false, msg: 'Password must be at least 8 characters long' };
        if (!/[A-Z]/.test(p)) return { valid: false, msg: 'Password must contain at least one uppercase letter (A-Z)' };
        if (!/\d/.test(p)) return { valid: false, msg: 'Password must contain at least one number' };
        return { valid: true };
    }

    async function handleLogin(e) {
        if(e) e.preventDefault();
        const u = document.getElementById('loginUsername').value;
        const p = document.getElementById('loginPassword').value;
        try {
            const res = await fetch(`${CONFIG.API_BASE}/auth/login`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: u, password: p}) });
            const d = await res.json();
            if(res.ok) {
                localStorage.setItem('accessToken', d.access_token);
                localStorage.setItem('currentUser', d.username);
                localStorage.setItem('userType', d.user_type);
                localStorage.setItem('userEmail', d.email);
                localStorage.setItem('isAdmin', d.is_admin);
                
                currentToken = d.access_token; currentUser = d.username; currentUserType = d.user_type; currentEmail = d.email;
                
                showNotification('Success!', 'success');
                showLoggedInUI();
                window.showTab('dashboard');
            } else showNotification(d.error, 'danger');
        } catch(e) { showNotification('Login failed', 'danger'); }
    }

    async function handleRegister(e) {
        if(e) e.preventDefault();
        const u = document.getElementById('regUsername').value;
        const e_mail = document.getElementById('regEmail').value;
        const p = document.getElementById('regPassword').value;
        const t = document.getElementById('userType').value;
        
        // Password Validation (Frontend)
        const check = isValidPassword(p);
        if (!check.valid) {
            showNotification(check.msg, 'warning');
            return;
        }

        try {
            const res = await fetch(`${CONFIG.API_BASE}/auth/register`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: u, email: e_mail, password: p, user_type: t}) });
            if(res.ok) { showNotification('Registered! Please login.', 'success'); window.showAuthTab('login'); }
            else { 
                const d = await res.json();
                showNotification(d.error || 'Failed', 'danger'); 
            }
        } catch(err) { showNotification('Error', 'danger'); }
    }

    // Exported for onclick
    // FIX: Hard Logout to clear memory and prevent Ghost Dashboard
    window.handleLogout = function() {
        if(confirm("Are you sure you want to logout?")) {
            localStorage.clear();
            showNotification('Logged out successfully', 'success');
            setTimeout(() => {
                window.location.href = '/'; // Hard Refresh
            }, 500);
        }
    };

    // Exported for onclick
    window.openProfileModal = function() { document.getElementById('profileModal').style.display = 'block'; document.getElementById('profileUsername').value = currentUser; document.getElementById('profileEmail').value = currentEmail; };
    window.closeProfileModal = function() { document.getElementById('profileModal').style.display = 'none'; };
    
    // Exported for onclick
    window.updateProfile = async function() {
        const u = document.getElementById('profileUsername').value;
        const e = document.getElementById('profileEmail').value;
        const t = document.getElementById('profileUserType').value;
        await fetch(`${CONFIG.API_BASE}/user/profile`, { method: 'PUT', headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}`}, body: JSON.stringify({username:u, email:e, user_type:t})});
        currentUser = u; currentEmail = e; currentUserType = t;
        localStorage.setItem('currentUser', u); localStorage.setItem('userEmail', e); localStorage.setItem('userType', t);
        showNotification('Updated', 'success'); window.closeProfileModal(); showLoggedInUI();
    };

    // Exported for onclick
    window.openFeedbackModal = function() { document.getElementById('feedbackModal').style.display = 'block'; };
    window.closeFeedbackModal = function() { document.getElementById('feedbackModal').style.display = 'none'; };
    window.openSupportModal = function() { document.getElementById('supportModal').style.display = 'block'; };
    window.closeSupportModal = function() { document.getElementById('supportModal').style.display = 'none'; };
    window.openForgotPasswordModal = function() { document.getElementById('forgotPasswordModal').style.display = 'block'; };
    window.closeForgotPasswordModal = function() { document.getElementById('forgotPasswordModal').style.display = 'none'; };

    // Exported for onclick
    window.requestResetLink = async function() {
        const email = document.getElementById('forgotEmail').value;
        if (!email) {
            showNotification('Please enter your email', 'warning');
            return;
        }
        
        try {
            const response = await fetch(`${CONFIG.API_BASE}/auth/forgot-password`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ email: email }) 
            });
            
            if (response.ok) {
                document.getElementById('forgotStep1').style.display = 'none';
                document.getElementById('forgotStep2').style.display = 'block';
                showNotification('Reset link sent', 'success');
            } else {
                showNotification('Error sending link', 'danger');
            }
        } catch (e) {
            showNotification('Connection failed', 'danger');
        }
    };

    // Exported for onclick
    window.changePassword = async function() {
        const current = document.getElementById('currentPassword').value;
        const newPass = document.getElementById('newPassword').value;
        if (!current || !newPass) {
            showNotification('Please fill in all fields', 'warning');
            return;
        }
        
        // Password Validation (Frontend)
        const check = isValidPassword(newPass);
        if (!check.valid) {
            showNotification(check.msg, 'warning');
            return;
        }
        
        try {
            const res = await fetch(`${CONFIG.API_BASE}/user/password`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({
                    current_password: current,
                    new_password: newPass
                })
            });
            
            const data = await res.json();
            
            if (res.ok) {
                showNotification(data.message, 'success');
                if (document.getElementById('profileForm')) {
                    // Assuming there might be a password form ID, if not, manually clear inputs
                    document.getElementById('currentPassword').value = '';
                    document.getElementById('newPassword').value = '';
                }
                window.closeProfileModal();
            } else {
                showNotification(data.error || 'Failed to update password', 'danger');
            }
        } catch (e) {
            showNotification('Connection error', 'danger');
        }
    };
    
    // ==========================================
   // ✅ SECURE DOWNLOAD HELPER (CORRECT BLOB HANDLING)
 
  async function secureDownload(endpoint, filename) {
        if (!currentToken) {
            showNotification('Please login first', 'warning');
            return;
        }
        
        showNotification('Preparing download...', 'info');
        
        try {
            const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${currentToken}`
                }
            });

            if (response.ok) {
                // Convert the response to a Blob (Binary Large Object)
                const blob = await response.blob();
                // Create a temporary URL for the Blob
                const url = window.URL.createObjectURL(blob);
                
                // Create a hidden link element to trigger the download
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                
                // Cleanup
                window.URL.revokeObjectURL(url);
                a.remove();
                showNotification('Download complete', 'success');
            } else {
                const err = await response.json();
                showNotification(err.error || 'Download failed', 'danger');
            }
        } catch (error) {
            console.error(error);
            showNotification('Network error during download', 'danger');
        }
    }

    // Exported for onclick
    window.downloadCSV = function() { secureDownload('/export/csv', 'spendwise_data.csv'); }; 
    window.downloadPDF = function() { secureDownload('/export/pdf', 'spendwise_report.pdf'); }; 
    
    
    // Exported for onclick
    window.submitFeedback = async function() { 
        const rating = document.querySelector('input[name="rating"]:checked')?.value || 5;
        const message = document.getElementById('feedbackMessage').value;
        
        await fetch(`${CONFIG.API_BASE}/feedback`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}`}, 
            body: JSON.stringify({rating: rating, message: message})
        });
        
        showNotification('Feedback Sent!', 'success'); 
        window.closeFeedbackModal(); 
    };

    // ==========================================
    // INIT
    // ==========================================
    
    // FIX #2: Store token in local scope, not global window object
    let localResetToken = null;

    document.addEventListener('DOMContentLoaded', () => {
        const urlParams = new URLSearchParams(window.location.search);
        const resetTokenParam = urlParams.get('reset_token');

        if (resetTokenParam) {
            localResetToken = resetTokenParam; // Stored safely in closure
            const resetModal = document.getElementById('resetPasswordModal');
            if (resetModal) {
                resetModal.style.display = 'block';
                const authWrapper = document.getElementById('authWrapper');
                if (authWrapper) authWrapper.style.display = 'none';
            }
        }

        // Updated submitNewPassword to use local variable
       // Updated submitNewPassword to fix the "Dashboard showing" bug
        window.submitNewPassword = async function() {
            const p = document.getElementById('finalNewPassword').value;
            
            if (!localResetToken) {
                showNotification('Invalid or missing token', 'danger');
                return;
            }
            
            // Validation
            const check = isValidPassword(p);
            if (!check.valid) {
                showNotification(check.msg, 'warning');
                return;
            }

            try {
                const res = await fetch(`${CONFIG.API_BASE}/auth/reset-password`, { 
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'}, 
                    body: JSON.stringify({ token: localResetToken, new_password: p }) 
                });
                
                if(res.ok) { 
                    showNotification('Reset Success! Please Login.', 'success'); 
                    document.getElementById('resetPasswordModal').style.display = 'none'; 
                    
                    // 1. Clean the URL
                    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                    window.history.replaceState({path: newUrl}, '', newUrl);
                    localResetToken = null;

                    // 2. CRITICAL FIX: Clear old session data so Dashboard doesn't show
                    localStorage.clear();
                    currentToken = null;
                    currentUser = null;

                    // 3. Force showing the Login UI
                    showLoginUI(); 
                    
                } else {
                    const d = await res.json();
                    showNotification(d.error || 'Reset failed', 'danger');
                }
            } catch (error) {
                console.error(error);
                showNotification('Connection error', 'danger');
            }
        };
        const today = new Date().toISOString().split('T')[0];
        const m = new Date().toISOString().slice(0, 7);
        const mInput = document.getElementById('dashboardMonthInput');
        if(mInput) { mInput.value = m; mInput.addEventListener('change', () => loadDashboard(mInput.value)); }
        ['date', 'incomeDate', 'recDate'].forEach(id => { const el = document.getElementById(id); if(el) el.value = today; });

        const loginForm = document.getElementById('loginForm');
        if(loginForm) loginForm.addEventListener('submit', handleLogin);
        
        const registerForm = document.getElementById('registerForm');
        if(registerForm) registerForm.addEventListener('submit', handleRegister);

        const ids = ['addExpenseBtn', 'addIncomeBtn', 'setBudgetBtn', 'setEmergencyFundBtn'];
        const fns = [addExpense, addIncome, setBudget, setEmergencyFund];
        ids.forEach((id, i) => { const el = document.getElementById(id); if(el) el.addEventListener('click', fns[i]); });

        // Mobile Menu Logic (Ensuring it works with your new CSS)
        const menuBtn = document.getElementById('menu-toggle');
        const sidebar = document.querySelector('.sidebar');
        if (menuBtn && sidebar) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                sidebar.classList.toggle('active');
            });
            document.addEventListener('click', (e) => {
                if (sidebar.classList.contains('active') && !sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
                    sidebar.classList.remove('active');
                }
            });
        }

        if(currentToken) { showLoggedInUI(); window.showTab('dashboard'); }
        else if (!resetTokenParam) { showLoginUI(); }
    });

})(); // End IIFE