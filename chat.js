// Chat JavaScript - Firebase Authentication and Firestore Integration

// DOM Elements
const authCard = document.getElementById('auth-card');
const chatCard = document.getElementById('chat-card');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const logoutBtn = document.getElementById('logout-btn');
const currentUserSpan = document.getElementById('current-user');
const authBtns = document.querySelectorAll('.auth-btn');

// Firebase references
let db;
let auth;
let messagesListener = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase !== 'undefined') {
        db = firebase.firestore();
        auth = firebase.auth();
        
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
    } else {
        console.error('Firebase not initialized');
    }
});

// Auth tab switching
function setupAuthTabs() {
    authBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            authBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const tabName = btn.getAttribute('data-tab');
            document.getElementById(`${tabName}-form`).classList.add('active');
            
            const otherForm = tabName === 'login' ? 'register' : 'login';
            document.getElementById(`${otherForm}-form`).classList.remove('active');
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
        if (e.key === 'Enter') sendMessage();
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
        if (msg.userId === currentUserId) {
            messageDiv.classList.add('own');
        } else {
            messageDiv.classList.add('other');
        }
        
        const timestamp = msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date();
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="username">${escapeHtml(msg.username)}</span>
                <span class="time">${timestamp.toLocaleTimeString()}</span>
            </div>
            <div class="message-text">${escapeHtml(msg.text)}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
    });
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// UI Functions
function showChatInterface() {
    authCard.style.display = 'none';
    chatCard.style.display = 'block';
    
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
    authCard.style.display = 'block';
    chatCard.style.display = 'none';
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
