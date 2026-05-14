// Chat JavaScript - Firebase Authentication and Firestore Integration

// DOM Elements
const authForms = document.getElementById('auth-forms');
const chatInterface = document.getElementById('chat-interface');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const logoutBtn = document.getElementById('logout-btn');
const currentUserSpan = document.getElementById('current-user');
const authTabs = document.querySelectorAll('.auth-tab');

// Firebase references
let db;
let auth;
let messagesListener = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Wait for Firebase to be initialized
    if (typeof firebase !== 'undefined') {
        db = firebase.firestore();
        auth = firebase.auth();
        
        // Check if user is already logged in
        auth.onAuthStateChanged(user => {
            if (user) {
                showChatInterface();
                setupMessageListener();
            } else {
                showAuthForms();
            }
        });
        
        setupAuthTabs();
        setupForms();
        setupAnimations();
    } else {
        console.error('Firebase not initialized');
    }
});

// Setup fade-in animations
function setupAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });
    
    // Observe auth forms for fade-in
    setTimeout(() => {
        observer.observe(authForms);
        observer.observe(loginForm);
        observer.observe(registerForm);
    }, 100);
}

// Auth tab switching with smooth fade
function setupAuthTabs() {
    authTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            authTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const tabName = tab.getAttribute('data-tab');
            const activeForm = document.getElementById(`${tabName}-form`);
            const otherTab = tabName === 'login' ? 'register' : 'login';
            const otherForm = document.getElementById(`${otherTab}-form`);
            
            // Fade out current form
            const currentlyActive = document.querySelector('.auth-form.active');
            if (currentlyActive && currentlyActive !== activeForm) {
                currentlyActive.style.opacity = '0';
                currentlyActive.style.transform = 'translateY(20px)';
                
                setTimeout(() => {
                    currentlyActive.classList.remove('active');
                    activeForm.classList.add('active');
                    activeForm.style.opacity = '1';
                    activeForm.style.transform = 'translateY(0)';
                }, 300);
            } else {
                activeForm.classList.add('active');
                activeForm.style.opacity = '1';
                activeForm.style.transform = 'translateY(0)';
            }
        });
    });
}

// Form handling
function setupForms() {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        
        try {
            await auth.signInWithEmailAndPassword(email, password);
            loginError.textContent = '';
        } catch (error) {
            loginError.textContent = error.message;
        }
    });
    
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;
        
        if (!username || !email || !password) {
            registerError.textContent = 'Please fill in all fields';
            return;
        }
        
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            
            // Store username in Firestore
            await db.collection('users').doc(userCredential.user.uid).set({
                username: username,
                email: email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            registerError.textContent = '';
        } catch (error) {
            registerError.textContent = error.message;
        }
    });
    
    logoutBtn.addEventListener('click', async () => {
        await auth.signOut();
        if (messagesListener) {
            messagesListener();
            messagesListener = null;
        }
    });
    
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
}

// Setup real-time message listener
function setupMessageListener() {
    if (!db) return;
    
    messagesListener = db.collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(100)
        .onSnapshot(snapshot => {
            renderMessages(snapshot.docs.reverse());
        }, error => {
            console.error('Error listening to messages:', error);
        });
}

// Send message
async function sendMessage() {
    const messageText = chatInput.value.trim();
    const user = auth.currentUser;
    
    if (!messageText || !user) return;
    
    try {
        // Get username from Firestore
        const userDoc = await db.collection('users').doc(user.uid).get();
        const username = userDoc.exists ? userDoc.data().username : user.email;
        
        await db.collection('messages').add({
            username: username,
            userId: user.uid,
            text: messageText,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        chatInput.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

// Render messages
function renderMessages(docs) {
    chatMessages.innerHTML = '';
    
    docs.forEach(doc => {
        const msg = doc.data();
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        
        const currentUserId = auth.currentUser?.uid;
        const messageUserId = msg.userId;
        
        if (messageUserId === currentUserId) {
            messageDiv.classList.add('own');
        } else {
            messageDiv.classList.add('other');
        }
        
        const timestamp = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date();
        const messageContent = `
            <div class="message-header">
                <span class="username">${escapeHtml(msg.username)}</span>
                <span class="time">${timestamp.toLocaleTimeString()}</span>
            </div>
            <div class="message-text">${escapeHtml(msg.text)}</div>
        `;
        
        messageDiv.innerHTML = messageContent;
        chatMessages.appendChild(messageDiv);
    });
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// UI Functions
function showChatInterface() {
    authForms.style.display = 'none';
    chatInterface.style.display = 'block';
    const user = auth.currentUser;
    if (user) {
        db.collection('users').doc(user.uid).get().then(doc => {
            if (doc.exists) {
                currentUserSpan.textContent = `Welcome, ${doc.data().username}!`;
            } else {
                currentUserSpan.textContent = `Welcome!`;
            }
        });
    }
}

function showAuthForms() {
    authForms.style.display = 'block';
    chatInterface.style.display = 'none';
    loginForm.reset();
    registerForm.reset();
    loginError.textContent = '';
    registerError.textContent = '';
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
