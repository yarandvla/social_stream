(function () {
	
	var isExtensionOn = true;
	var processedComments = new Set();

	function escapeHtml(unsafe) {
		try {
			if (settings.textonlymode) {
				return unsafe;
			}
			return unsafe
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;")
				.replace(/"/g, "&quot;")
				.replace(/'/g, "&#039;") || "";
		} catch(e) {
			return "";
		}
	}

	function getAllContentNodes(element) {
		var resp = "";
		
		if (!element) {
			return resp;
		}
		
		if (!element.childNodes || !element.childNodes.length) {
			if (element.textContent) {
				return escapeHtml(element.textContent) || "";
			} else {
				return "";
			}
		}
		
		element.childNodes.forEach(node => {
			if (node.childNodes.length) {
				resp += getAllContentNodes(node);
			} else if ((node.nodeType === 3) && node.textContent && (node.textContent.trim().length > 0)) {
				resp += escapeHtml(node.textContent);
			} else if (node.nodeType === 1) {
				if (!settings.textonlymode) {
					if ((node.nodeName == "IMG") && node.src) {
						node.src = node.src + "";
						resp += node.outerHTML;
					}
				}
			}
		});
		return resp;
	}

	function processMessage(ele) {
		if (!ele || !ele.isConnected) {
			return;
		}
		
		// Get the unique comment ID
		var commentId = "";
		try {
			var commentDiv = ele.querySelector(".comment[data-uniq-id]");
			if (commentDiv) {
				commentId = commentDiv.getAttribute("data-uniq-id");
			}
		} catch(e) {}
		
		if (!commentId) {
			commentId = ele.getAttribute("data-created");
		}
		
		// Skip if already processed
		if (!commentId || processedComments.has(commentId)) {
			return;
		}
		processedComments.add(commentId);
		
		// Keep set size manageable
		if (processedComments.size > 1000) {
			var iterator = processedComments.values();
			processedComments.delete(iterator.next().value);
		}
		
		// Extract user name
		var name = "";
		var nameColor = "";
		try {
			var titleEl = ele.querySelector(".title");
			if (titleEl) {
				// Try to get name from the link (registered users)
				var nameLink = titleEl.querySelector("a[href^='/pl/']");
				if (nameLink) {
					name = nameLink.textContent.trim();
					// Capture color style if present
					if (nameLink.style && nameLink.style.color) {
						nameColor = nameLink.style.color;
					}
				} else {
					// Try to get name from span (guest users or no link)
					var nameSpan = titleEl.querySelector("span[style]");
					if (nameSpan) {
						name = nameSpan.textContent.trim();
					} else {
						// Fallback: get all text after the time span
						var timeSpan = titleEl.querySelector("span");
						if (timeSpan) {
							name = titleEl.textContent.replace(timeSpan.textContent, "").replace(":", "").trim();
						}
					}
				}
			}
		} catch(e) {
			// console.warn("Error extracting name:", e);
		}
		
		if (!name) {
			return;
		}
		
		// Extract message text
		var msg = "";
		try {
			var textEl = ele.querySelector(".text .main .emoji-text.text-content");
			if (textEl) {
				msg = getAllContentNodes(textEl).trim();
			}
		} catch(e) {
			// console.warn("Error extracting message:", e);
		}
		
		if (!msg) {
			return;
		}
		
		// Extract user ID and profile link
		var userId = "";
		var userLink = "";
		try {
			var commentDiv = ele.querySelector(".comment[data-user-id]");
			if (commentDiv) {
				userId = commentDiv.getAttribute("data-user-id");
			}
			
			var nameLink = ele.querySelector(".title a[href^='/pl/']");
			if (nameLink) {
				userLink = nameLink.href;
			}
		} catch(e) {}
		
		// Try to get avatar - GetCourse doesn't show avatars in the chat directly
		// but we can construct a placeholder or try to fetch from user profile
		var chatimg = "./sources/images/getcourse.png";  // GetCourse icon for chat
		
		// Get timestamp if available and format it properly
		var timestamp = null;
		var rawTime = "";
		try {
			var timeEl = ele.querySelector(".title span");
			if (timeEl) {
				rawTime = timeEl.textContent.trim();
				// GetCourse shows time like "13:10" (24h format, UTC+3)
				// Create a valid Date object with today's date and this time
				if (rawTime.match(/^\d{1,2}:\d{2}$/)) {
					var now = new Date();
					var timeParts = rawTime.split(':');
					var hours = parseInt(timeParts[0], 10);
					var minutes = parseInt(timeParts[1], 10);
					
					// Set hours and minutes, keep current date
					now.setHours(hours, minutes, 0, 0);
					timestamp = now.getTime(); // Unix timestamp in milliseconds
				}
			}
		} catch(e) {}
		
		// Prepare message data
		var data = {};
		data.chatname = escapeHtml(name);
		data.chatbadges = "";
		data.backgroundColor = "";
		data.textColor = "";
		data.nameColor = nameColor;
		data.chatmessage = msg;
		data.chatimg = chatimg;
		data.hasDonation = "";
		data.membership = "";
		data.contentimg = "";
		data.textonly = settings.textonlymode || false;
		data.type = "getcourse";
		
		// Additional metadata for replies
		if (userId) {
			data.userId = userId;
		}
		if (userLink) {
			data.userLink = userLink;
		}
		if (timestamp) {
			data.timestamp = timestamp;
		}
		// Store raw time string for display (GetCourse already uses 24h format)
		data.timeString = rawTime;
		
		pushMessage(data);
	}

	function pushMessage(data) {
		try {
			chrome.runtime.sendMessage(chrome.runtime.id, { "message": data }, function(){});
		} catch(e) {
			// console.warn("Error pushing message:", e);
		}
	}

	var settings = {};

	chrome.runtime.sendMessage(chrome.runtime.id, { "getSettings": true }, function(response) {
		if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.lastError) { return; }
		response = response || {};
		if ("settings" in response) {
			settings = response.settings;
		}
	});

	chrome.runtime.onMessage.addListener(
		function (request, sender, sendResponse) {
			try {
				if ("getSource" == request) {
					sendResponse("getcourse");
					return;
				}
				if ("focusChat" == request) {
					// Focus the comment input field
					var input = document.querySelector(".new-comment-input, input[name='GetCourseComment[comment_text]']");
					if (input) {
						input.focus();
					}
					sendResponse(true);
					return;
				}
				if (typeof request === "object") {
					if ("settings" in request) {
						settings = request.settings;
						sendResponse(true);
						return;
					}
				}
			} catch(e) {}
			sendResponse(false);
		}
	);

	function onElementInserted(target) {
		if (!target) return;
		
		var onMutationsObserved = function(mutations) {
			mutations.forEach(function(mutation) {
				if (mutation.addedNodes.length) {
					for (var i = 0, len = mutation.addedNodes.length; i < len; i++) {
						try {
							var node = mutation.addedNodes[i];
							if (node.nodeType === 1) {
								// Check if it's a comment element
								if (node.classList && node.classList.contains("gc-comment")) {
									setTimeout(function(ele) {
										processMessage(ele);
									}, 100, node);
								} else if (node.querySelector && node.querySelector(".gc-comment")) {
									// Container with multiple comments
									var comments = node.querySelectorAll(".gc-comment");
									comments.forEach(function(comment) {
										setTimeout(function(ele) {
											processMessage(ele);
										}, 100, comment);
									});
								}
							}
						} catch(e) {}
					}
				}
			});
		};
		
		var config = { childList: true, subtree: true };
		var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
		var observer = new MutationObserver(onMutationsObserved);
		observer.observe(target, config);
	}

	console.log("Social Stream Ninja: GetCourse integration injected");

	// Main polling loop to find and observe the comments container
	setInterval(function() {
		try {
			// Look for the comments container
			var commentsContainers = [
				".comments-top-level.comments",
				".comments-tree .comments-container .comments",
				"[data-element='comments-tree'] .comments"
			];
			
			for (var i = 0; i < commentsContainers.length; i++) {
				var container = document.querySelector(commentsContainers[i]);
				if (container && !container.marked) {
					container.marked = true;
					console.log("Social Stream Ninja: Connected to GetCourse comments");
					
					// Process existing comments
					var existingComments = container.querySelectorAll(".gc-comment");
					existingComments.forEach(function(comment) {
						setTimeout(function(ele) {
							processMessage(ele);
						}, 100, comment);
					});
					
					// Start observing for new comments
					onElementInserted(container);
				}
			}
		} catch(e) {
			// console.warn("Error in GetCourse polling:", e);
		}
	}, 2000);

	// Also try to find the chat widget directly
	setInterval(function() {
		try {
			var chatWidget = document.querySelector(".chat-widget.comments-tree-wrapper");
			if (chatWidget && !chatWidget.marked) {
				chatWidget.marked = true;
				console.log("Social Stream Ninja: Found GetCourse chat widget");
				
				// Find the comments container within
				var commentsContainer = chatWidget.querySelector(".comments-top-level, .comments-container .comments");
				if (commentsContainer && !commentsContainer.marked) {
					commentsContainer.marked = true;
					
					// Process existing comments
					var existingComments = commentsContainer.querySelectorAll(".gc-comment");
					existingComments.forEach(function(comment) {
						setTimeout(function(ele) {
							processMessage(ele);
						}, 100, comment);
					});
					
					// Start observing for new comments
					onElementInserted(commentsContainer);
				}
			}
		} catch(e) {}
	}, 3000);

})();
