// Rate limiting and anti-throttling configurations
const SCROLL_DELAY_MS = 2000 + Math.random() * 1000; // Random delay between 2-3 seconds
const SCROLL_BATCH_SIZE = 5; // Number of scrolls before pause
const BATCH_PAUSE_MS = 5000; // Pause duration between batches
const MAX_COMMENTS_PER_BATCH = 20; // Maximum comments to process in one batch

// Function to extract channel information
function getChannelInfo() {
    try {
        // Try multiple selectors to find channel name
        const selectors = [
            'ytd-channel-name yt-formatted-string.ytd-channel-name a',
            '#channel-name yt-formatted-string a',
            '#owner #text a',
            'ytd-video-owner-renderer .ytd-channel-name a'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent) {
                return {
                    channelName: element.textContent.trim(),
                    channelUrl: element.href
                };
            }
        }

        // Fallback method using structured data
        const structuredData = document.querySelector('script[type="application/ld+json"]');
        if (structuredData) {
            const data = JSON.parse(structuredData.textContent);
            if (data.author) {
                return {
                    channelName: data.author.name,
                    channelUrl: data.author.url
                };
            }
        }

        throw new Error('Channel information not found');
    } catch (error) {
        console.error('Error extracting channel info:', error);
        return {
            channelName: 'Unknown Channel',
            channelUrl: null,
            error: error.message
        };
    }
}

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getChannelInfo') {
        const channelInfo = getChannelInfo();
        sendResponse(channelInfo);
    }
    return true; // Keep the message channel open for async response
});

// Observe DOM changes to handle dynamic loading
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type === 'childList' && document.querySelector('ytd-channel-name')) {
            observer.disconnect();
            break;
        }
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

async function extractCommentsWithRateLimit(desiredComments) {
    const comments = [];
    let attempts = 0;
    const maxAttempts = 30;
    let lastCommentCount = 0;
    let noNewCommentsCount = 0;

    // Add random delays between operations
    const randomDelay = () => new Promise(resolve => 
        setTimeout(resolve, Math.random() * 1000 + 500)
    );

    // Scroll with rate limiting
    const scrollWithRateLimit = async () => {
        for (let i = 0; i < SCROLL_BATCH_SIZE; i++) {
            if (comments.length >= desiredComments) break;

            window.scrollBy(0, Math.floor(500 + Math.random() * 300));
            await new Promise(resolve => setTimeout(resolve, SCROLL_DELAY_MS));
            
            // Add some random mouse movements to appear more human-like
            simulateHumanBehavior();
        }
        
        // Pause between batches
        await new Promise(resolve => setTimeout(resolve, BATCH_PAUSE_MS));
    };

    // Simulate human-like behavior
    const simulateHumanBehavior = () => {
        const randomX = Math.floor(Math.random() * window.innerWidth);
        const randomY = Math.floor(Math.random() * window.innerHeight);
        
        // Create and dispatch a mouse move event
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: randomX,
            clientY: randomY,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(mouseEvent);
    };

    try {
        // Initial delay before starting
        await randomDelay();

        while (comments.length < desiredComments && attempts < maxAttempts) {
            const commentThreads = document.querySelectorAll('ytd-comment-thread-renderer');
            let newCommentsInBatch = 0;

            for (const thread of commentThreads) {
                if (comments.length >= desiredComments || 
                    newCommentsInBatch >= MAX_COMMENTS_PER_BATCH) break;

                const commentData = extractCommentData(thread);
                if (commentData && !isDuplicate(comments, commentData)) {
                    comments.push(commentData);
                    newCommentsInBatch++;
                    
                    // Add small delay between processing comments
                    await randomDelay();
                }
            }

            if (comments.length === lastCommentCount) {
                noNewCommentsCount++;
                if (noNewCommentsCount >= 3) {
                    break;
                }
            } else {
                noNewCommentsCount = 0;
            }
            
            lastCommentCount = comments.length;

            if (comments.length < desiredComments) {
                await scrollWithRateLimit();
                attempts++;
            }
        }

        // Smooth scroll back to top
        await smoothScrollToTop();

        return {
            comments: comments.slice(0, desiredComments),
            totalFound: comments.length,
            reachedLimit: attempts >= maxAttempts,
            attempts: attempts
        };

    } catch (error) {
        console.error('Error in comment extraction:', error);
        return {
            comments: comments.slice(0, desiredComments),
            totalFound: comments.length,
            error: error.message,
            attempts: attempts
        };
    }
}

function extractCommentData(thread) {
    try {
        const commentElement = thread.querySelector('#content-text');
        const timeElement = thread.querySelector('a.yt-simple-endpoint[href*="lc="]');
        const likeElement = thread.querySelector('#vote-count-middle');
        const authorElement = thread.querySelector('#author-text');
        
        if (!commentElement) return null;

        return {
            text: commentElement.textContent.trim(),
            timestamp: timeElement ? timeElement.textContent.trim() : 'Unknown time',
            likes: likeElement ? likeElement.textContent.trim() : '0',
            author: authorElement ? authorElement.textContent.trim() : 'Unknown author'
        };
    } catch (error) {
        console.error('Error extracting comment data:', error);
        return null;
    }
}

function isDuplicate(comments, newComment) {
    return comments.some(c => 
        c.text === newComment.text && 
        c.author === newComment.author && 
        c.timestamp === newComment.timestamp
    );
}

async function smoothScrollToTop() {
    const scrollStep = -window.scrollY / 20;
    const scrollInterval = setInterval(() => {
        if (window.scrollY !== 0) {
            window.scrollBy(0, scrollStep);
        } else {
            clearInterval(scrollInterval);
        }
    }, 15);
    
    return new Promise(resolve => {
        setTimeout(resolve, 500);
    });
}
