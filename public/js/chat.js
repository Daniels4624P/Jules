document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const chatListEl = document.getElementById('chatList');
    const chatHeaderEl = document.getElementById('chatHeader');
    const messagesEl = document.getElementById('messages');
    const messageInputEl = document.getElementById('messageInput');
    const sendMessageButtonEl = document.getElementById('sendMessageButton');
    const typingIndicatorEl = document.getElementById('typingIndicator');
    const logoutButtonEl = document.getElementById('logoutButton');
    const searchInputEl = document.getElementById('searchInput');
    const newChatButtonEl = document.getElementById('newChatButton');
    const newChatModalEl = document.getElementById('newChatModal');
    const closeButtonEl = newChatModalEl.querySelector('.close-button');
    const createChatConfirmButtonEl = document.getElementById('createChatConfirmButton');
    const otherUserIdsInputEl = document.getElementById('otherUserIds');
    const chatNameInputEl = document.getElementById('chatName');
    const newChatMessageEl = document.getElementById('newChatMessage');

    // --- State ---
    let currentUserId = null; // Will be set after fetching user data or from token
    let selectedChatId = null;
    let typingTimeout = null;
    const socket = io({ transports: ['websocket'], withCredentials: true });

    // --- Utility Functions ---
    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const displayMessage = (message, isPrepended = false) => {
        const item = document.createElement('div');
        item.classList.add('message-item');
        const isSent = message.sender && message.sender.id === currentUserId;
        item.classList.add(isSent ? 'sent' : 'received');

        const senderName = message.sender ? (isSent ? 'You' : message.sender.username) : 'System';
        
        item.innerHTML = `
            <div class="message-sender">${senderName}</div>
            <div class="message-content">${message.content}</div>
            <div class="message-timestamp">${formatDate(message.created_at)}</div>
        `;
        if (isPrepended) {
            messagesEl.insertBefore(item, messagesEl.firstChild);
        } else {
            messagesEl.appendChild(item);
            messagesEl.scrollTop = messagesEl.scrollHeight; // Scroll to bottom
        }
    };

    const renderChatItem = (chat) => {
        const item = document.createElement('li');
        item.dataset.chatId = chat.id;
        item.classList.toggle('active', chat.id === selectedChatId);

        let displayName = chat.name || 'Unnamed Chat';
        if (!chat.is_group_chat && chat.other_participants && chat.other_participants.length > 0) {
            displayName = chat.other_participants.map(p => p.username).join(', ');
        } else if (!chat.is_group_chat && chat.all_participants) {
            // Fallback if other_participants is empty but all_participants has the other user
            const otherUser = chat.all_participants.find(p => p.id !== currentUserId);
            if (otherUser) displayName = otherUser.username;
        }
        
        // Placeholder for last message preview
        const lastMessage = chat.last_message ? `${chat.last_message.sender.username}: ${chat.last_message.content}` : 'No messages yet.';
        
        item.innerHTML = `
            <div class="chat-info">
                <span class="chat-name">${displayName}</span>
                <span class="chat-preview" style="display:none;">${lastMessage.substring(0,30)}...</span>
            </div>
            <span class="unread-count" style="display:none;">0</span>
        `;
        item.addEventListener('click', () => selectChat(chat.id, displayName));
        return item;
    };

    const populateChatList = (chats) => {
        chatListEl.innerHTML = '';
        if (!chats || chats.length === 0) {
            chatListEl.innerHTML = '<li>No chats found.</li>';
            return;
        }
        chats.forEach(chat => {
            chatListEl.appendChild(renderChatItem(chat));
        });
    };

    // --- API & Socket Functions ---
    const fetchCurrentUserAndChats = async () => {
        try {
            // Attempt to get user info from a hypothetical endpoint or rely on socket.user if set by server
            // For now, we'll assume socket.user.id is set upon successful socket connection if auth is good.
            // If not, we need an API endpoint to get current user.
            // Let's simulate getting currentUserId from a successful socket connection or a failed state.
            // This part needs robust handling in a real app, possibly checking a cookie or local storage
            // if an initial API call for user data is preferred over waiting for socket connect.

            const response = await fetch('/api/chats');
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    console.log('User not authenticated, redirecting to login.');
                    window.location.href = '/index.html'; // Or login.html
                } else {
                    throw new Error(`Failed to fetch chats: ${response.status}`);
                }
                return;
            }
            const chats = await response.json();
             // Assuming the first user in any chat participant list is the current user if not available otherwise
            if (chats && chats.length > 0 && chats[0].all_participants) {
                 const self = chats[0].all_participants.find(p => {
                    // Heuristic: the user whose chats these are.
                    // This is a workaround. Ideally, server provides currentUserId or it's known from login.
                    // For now, we'll try to infer. A dedicated /api/users/me endpoint is better.
                    // Or, the socket connection handshake should confirm the user.
                    // Let's assume socket.user.id will be available after connection.
                 });
                 // currentUserId will be set by socket.on('connect') or an explicit fetch
            }
            populateChatList(chats);
        } catch (error) {
            console.error('Error fetching initial data:', error);
            // If fetch fails due to auth, redirect to login
            if (error.message.includes("401") || error.message.includes("403")) {
                 window.location.href = '/index.html';
            }
        }
    };
    
    const selectChat = async (chatId, chatName) => {
        if (selectedChatId === chatId) return;

        if (selectedChatId) {
            socket.emit('leaveChat', { chatId: selectedChatId });
            const prevActiveChatEl = chatListEl.querySelector(`li[data-chat-id="${selectedChatId}"]`);
            if (prevActiveChatEl) prevActiveChatEl.classList.remove('active');
        }

        selectedChatId = chatId;
        chatHeaderEl.textContent = chatName || 'Chat';
        messagesEl.innerHTML = '<li>Loading messages...</li>'; // Clear previous messages

        const currentActiveChatEl = chatListEl.querySelector(`li[data-chat-id="${selectedChatId}"]`);
        if (currentActiveChatEl) currentActiveChatEl.classList.add('active');

        try {
            const response = await fetch(`/api/chats/${chatId}/messages?limit=50`); // Fetch last 50
            if (!response.ok) throw new Error(`Failed to fetch messages: ${response.status}`);
            const messages = await response.json();
            messagesEl.innerHTML = ''; // Clear "Loading..."
            messages.forEach(msg => displayMessage(msg, true)); // Prepend, as they are ordered ASC
            messagesEl.scrollTop = messagesEl.scrollHeight; // Scroll to bottom

            socket.emit('joinChat', { chatId });
        } catch (error) {
            console.error('Error selecting chat:', error);
            messagesEl.innerHTML = '<li>Error loading messages.</li>';
        }
    };

    // --- Event Listeners ---
    // Socket Event Handlers
    socket.on('connect', () => {
        console.log('Connected to socket server');
        // The socket.user should be set by the server-side authentication middleware
        // If it's not, we have an issue with auth or the server isn't setting it.
        // For now, we'll try to get user ID from a successful connection if available.
        // This is usually available if the server sets it during the handshake.
        // A robust way is to have an API endpoint like /api/users/me to get user details.
        if (socket.io.opts.auth && socket.io.opts.auth.user) { // Check if server sent user data
            currentUserId = socket.io.opts.auth.user.id;
        } else if (socket.user && socket.user.id) { // Check if middleware attached user to socket
            currentUserId = socket.user.id;
        } else {
            console.warn("User ID not available on socket connection. Chat functionality might be limited.");
            // Attempt to fetch user from a dedicated endpoint if needed
            // fetch('/api/users/me').then(res => res.json()).then(user => currentUserId = user.id).catch(...)
        }
        fetchCurrentUserAndChats(); // Fetch chats once connected and potentially have user ID
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from socket server');
        typingIndicatorEl.textContent = '';
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
        if (error.message && (error.message.includes("Authentication error") || error.message.includes("Token expired"))) {
            alert("Session expired or invalid. Please login again.");
            window.location.href = '/index.html';
        }
    });
    
    socket.on('chatJoined', ({ chatId, message }) => {
        console.log(message);
        // You could update UI or state here if needed
    });

    socket.on('chatLeft', ({ chatId, message }) => {
        console.log(message);
        // You could update UI or state here if needed
    });

    socket.on('newMessage', (message) => {
        if (message.chat_id === selectedChatId) {
            displayMessage(message);
        }
        // Update chat list item preview (optional, more complex)
        const chatListItem = chatListEl.querySelector(`li[data-chat-id="${message.chat_id}"] .chat-preview`);
        if (chatListItem) {
            chatListItem.textContent = `${message.sender.username}: ${message.content.substring(0,30)}...`;
        }
    });

    socket.on('userTyping', ({ userId, username, chatId, isTyping }) => {
        if (chatId === selectedChatId && userId !== currentUserId) {
            typingIndicatorEl.textContent = isTyping ? `${username} is typing...` : '';
        }
    });

    // DOM Event Handlers
    sendMessageButtonEl.addEventListener('click', () => {
        const content = messageInputEl.value.trim();
        if (content && selectedChatId) {
            socket.emit('sendMessage', { chatId: selectedChatId, content });
            messageInputEl.value = '';
            // Stop typing indicator after sending
            if (typingTimeout) clearTimeout(typingTimeout);
            socket.emit('typing', { chatId: selectedChatId, isTyping: false });
        }
    });

    messageInputEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessageButtonEl.click();
        }
    });
    
    messageInputEl.addEventListener('input', () => {
        if (!selectedChatId) return;
        socket.emit('typing', { chatId: selectedChatId, isTyping: true });
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('typing', { chatId: selectedChatId, isTyping: false });
        }, 2000); // 2 seconds of no typing
    });

    logoutButtonEl.addEventListener('click', async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            socket.disconnect();
            window.location.href = '/index.html';
        } catch (error) {
            console.error('Logout error:', error);
        }
    });

    searchInputEl.addEventListener('input', async (e) => {
        const searchTerm = e.target.value.trim();
        if (searchTerm.length < 1 && searchTerm.length !== 0) { // Allow clearing search
            fetchCurrentUserAndChats(); // Reload all chats if search is cleared
            return;
        }
        if(searchTerm.length === 0) {
            fetchCurrentUserAndChats();
            return;
        }
        if (searchTerm.length < 2) return; // Don't search for very short terms

        try {
            const response = await fetch(`/api/chats/search?searchTerm=${encodeURIComponent(searchTerm)}`);
            if (!response.ok) throw new Error('Search failed');
            const chats = await response.json();
            populateChatList(chats);
        } catch (error) {
            console.error('Error searching chats:', error);
            chatListEl.innerHTML = '<li>Error searching.</li>';
        }
    });

    // New Chat Modal Logic
    newChatButtonEl.addEventListener('click', () => {
        newChatModalEl.style.display = 'flex';
        newChatMessageEl.textContent = '';
        otherUserIdsInputEl.value = '';
        chatNameInputEl.value = '';
    });

    closeButtonEl.addEventListener('click', () => {
        newChatModalEl.style.display = 'none';
    });

    window.addEventListener('click', (event) => { // Close modal if clicked outside
        if (event.target === newChatModalEl) {
            newChatModalEl.style.display = 'none';
        }
    });

    createChatConfirmButtonEl.addEventListener('click', async () => {
        const userIdsRaw = otherUserIdsInputEl.value.trim();
        const chatName = chatNameInputEl.value.trim();
        newChatMessageEl.textContent = '';

        if (!userIdsRaw) {
            newChatMessageEl.textContent = 'Please enter User ID(s).';
            newChatMessageEl.style.color = 'red';
            return;
        }
        
        const otherUserIds = userIdsRaw.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));

        if (otherUserIds.length === 0) {
            newChatMessageEl.textContent = 'Invalid User ID(s) provided.';
            newChatMessageEl.style.color = 'red';
            return;
        }
        
        const payload = { otherUserIds };
        if (otherUserIds.length > 1 && chatName) { // Only send name if it's a group chat and name is provided
            payload.name = chatName;
        } else if (otherUserIds.length > 1 && !chatName) {
             newChatMessageEl.textContent = 'Group chats should ideally have a name.';
             newChatMessageEl.style.color = 'orange';
             // Allow creation anyway, or enforce name here
        }


        try {
            const response = await fetch('/api/chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const newChat = await response.json();
            if (!response.ok) {
                throw new Error(newChat.message || 'Failed to create chat');
            }

            newChatMessageEl.textContent = 'Chat created successfully!';
            newChatMessageEl.style.color = 'green';
            fetchCurrentUserAndChats(); // Refresh chat list
            setTimeout(() => {
                newChatModalEl.style.display = 'none';
                selectChat(newChat.id, newChat.name || (newChat.other_participants && newChat.other_participants.length > 0 ? newChat.other_participants.map(p=>p.username).join(', ') : 'New Chat'));
            }, 1500);
        } catch (error) {
            console.error('Error creating chat:', error);
            newChatMessageEl.textContent = error.message || 'Error creating chat.';
            newChatMessageEl.style.color = 'red';
        }
    });


    // --- Initial Load ---
    // Check if already on chat page and potentially authenticated (e.g. cookie still valid)
    // A more robust check involves verifying token with server or having server redirect
    // if not authenticated when trying to access chat.html directly.
    // For now, if on chat.html, we assume an attempt to connect via socket will handle auth.
    // If socket connection fails auth, it should redirect.
    
    // fetchCurrentUserAndChats(); // Moved to socket.on('connect') to ensure currentUserId might be available

});
