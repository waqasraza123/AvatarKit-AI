export const widgetBrowserScript = `(() => {
  const script = document.currentScript;
  if (!script) {
    return;
  }

  const avatarId = (script.dataset.avatarId || "").trim();
  if (!avatarId) {
    return;
  }

  const apiBaseUrl = (script.dataset.apiBaseUrl || new URL(script.src).origin).replace(/\\/$/, "");
  const requestedTheme = script.dataset.theme === "light" ? "light" : "light";
  const requestedPosition = script.dataset.position === "bottom-left" ? "bottom-left" : "bottom-right";
  const rootKey = "avatarkit-widget-root-" + avatarId;
  if (document.querySelector('[data-avatarkit-root="' + rootKey + '"]')) {
    return;
  }

  const host = document.createElement("div");
  host.dataset.avatarkitRoot = rootKey;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const state = {
    config: null,
    open: false,
    loading: false,
    leadSubmitting: false,
    leadSubmitted: false,
    leadError: "",
    leadCapture: null,
    error: "",
    conversationId: "",
    visitorId: "",
    realtimeSessionId: "",
    realtimeStatus: "idle",
    realtimeFailed: false,
    messages: []
  };

  function getVisitorId() {
    const key = "avatarkit:visitor:" + avatarId;
    try {
      const existing = window.localStorage.getItem(key);
      if (existing) {
        return existing;
      }
      const next = window.crypto && "randomUUID" in window.crypto
        ? window.crypto.randomUUID()
        : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
      window.localStorage.setItem(key, next);
      return next;
    } catch {
      return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
    }
  }

  function absoluteUrl(value) {
    if (!value) {
      return "";
    }
    if (/^https?:\\/\\//i.test(value)) {
      return value;
    }
    return apiBaseUrl + value;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function css() {
    const position = state.config?.position || requestedPosition;
    const align = position === "bottom-left" ? "left: 22px;" : "right: 22px;";
    const color = state.config?.primaryColor || "#355cff";
    return "<style>" +
      ":host{all:initial;--ak-color:" + color + ";--ak-ease:cubic-bezier(.22,1,.36,1);--ak-ease-emphasis:cubic-bezier(.16,1,.3,1);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#0f172a}" +
      "@keyframes akWidgetPanelIn{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}" +
      "@keyframes akWidgetMessageIn{from{opacity:0;transform:translateY(8px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}" +
      "@keyframes akWidgetThinking{0%,100%{opacity:.58}50%{opacity:1}}" +
      ".ak-shell{position:fixed;bottom:22px;" + align + "z-index:2147483000;font-family:inherit}" +
      ".ak-launch-wrap{display:grid;gap:10px;justify-items:" + (position === "bottom-left" ? "start" : "end") + "}" +
      ".ak-greeting{max-width:260px;border:1px solid rgba(15,23,42,.1);border-radius:14px;background:#fff;padding:10px 12px;box-shadow:0 20px 60px rgba(15,23,42,.16);font-size:14px;line-height:1.45;color:#23304b;animation:akWidgetMessageIn .28s var(--ak-ease-emphasis) both}" +
      ".ak-launcher{width:64px;height:64px;border:0;border-radius:999px;background:var(--ak-color);box-shadow:0 18px 50px rgba(53,92,255,.32);color:#fff;display:grid;place-items:center;cursor:pointer;font:700 18px inherit;transition:transform .16s var(--ak-ease),box-shadow .16s var(--ak-ease),opacity .16s var(--ak-ease);animation:akWidgetPanelIn .32s var(--ak-ease-emphasis) both}" +
      ".ak-launcher:hover{transform:translateY(-2px);box-shadow:0 22px 58px rgba(53,92,255,.38)}.ak-launcher:active{transform:translateY(0)}" +
      ".ak-panel{width:min(380px,calc(100vw - 28px));height:min(620px,calc(100vh - 34px));border:1px solid rgba(15,23,42,.12);border-radius:18px;background:#fff;box-shadow:0 26px 90px rgba(15,23,42,.22);overflow:hidden;display:grid;grid-template-rows:auto 1fr auto auto;animation:akWidgetPanelIn .28s var(--ak-ease-emphasis) both}" +
      ".ak-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(15,23,42,.08);background:linear-gradient(180deg,#fff,#f8fbff)}" +
      ".ak-identity{display:flex;align-items:center;gap:10px;min-width:0}.ak-avatar,.ak-logo{width:42px;height:42px;border-radius:999px;background:var(--ak-color);color:#fff;display:grid;place-items:center;font-weight:800;flex:0 0 auto}.ak-logo{object-fit:cover;border:1px solid rgba(15,23,42,.1);background:#fff}.ak-title{min-width:0}.ak-title strong{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ak-title span{display:block;margin-top:2px;color:#667085;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".ak-close{border:1px solid rgba(15,23,42,.12);border-radius:999px;background:#fff;color:#0f172a;width:34px;height:34px;cursor:pointer;font:700 18px inherit;transition:background-color .14s var(--ak-ease),border-color .14s var(--ak-ease),transform .14s var(--ak-ease)}.ak-close:hover{border-color:rgba(53,92,255,.28);background:#eef3ff;transform:translateY(-1px)}" +
      ".ak-body{padding:14px;background:#f6f8ff;overflow:auto;display:grid;align-content:start;gap:10px}.ak-empty,.ak-error{border:1px solid rgba(15,23,42,.1);border-radius:12px;background:#fff;padding:12px;color:#344054;font-size:14px;line-height:1.45}.ak-error{border-color:#fecaca;background:#fef2f2;color:#991b1b}" +
      ".ak-message{max-width:88%;border:1px solid rgba(15,23,42,.08);border-radius:14px;padding:10px 12px;background:#fff;color:#1f2937;font-size:14px;line-height:1.45;white-space:pre-wrap;animation:akWidgetMessageIn .24s var(--ak-ease-emphasis) both}.ak-message.ak-visitor{justify-self:end;background:#eef3ff}.ak-message.ak-avatar{justify-self:start;background:#fff}.ak-media{margin-top:8px;display:grid;gap:6px;animation:akWidgetMessageIn .22s var(--ak-ease-emphasis) both}.ak-media audio,.ak-media video{width:100%;max-width:260px;border-radius:10px}.ak-media video{background:#0f172a;aspect-ratio:16/9}" +
      ".ak-lead-card{border:1px solid rgba(53,92,255,.2);border-radius:14px;background:#fff;padding:12px;display:grid;gap:10px;color:#23304b;animation:akWidgetMessageIn .26s var(--ak-ease-emphasis) both}.ak-lead-card h3{margin:0;font:800 14px inherit;color:#0f172a}.ak-lead-card p{margin:0;color:#667085;font-size:13px;line-height:1.45}.ak-lead-grid{display:grid;gap:8px}.ak-lead-field{display:grid;gap:5px;font:700 12px inherit;color:#344054}.ak-lead-field input,.ak-lead-field textarea{width:100%;border:1px solid rgba(15,23,42,.14);border-radius:10px;padding:9px 10px;font:13px inherit;outline:none;transition:border-color .14s var(--ak-ease),box-shadow .14s var(--ak-ease)}.ak-lead-field input:focus,.ak-lead-field textarea:focus{border-color:var(--ak-color);box-shadow:0 0 0 3px rgba(53,92,255,.14)}.ak-lead-field textarea{min-height:74px;resize:vertical}.ak-lead-actions{display:flex;flex-wrap:wrap;gap:8px}.ak-lead-submit,.ak-lead-skip{min-height:38px;border-radius:10px;padding:0 12px;font:800 13px inherit;cursor:pointer;transition:transform .14s var(--ak-ease),box-shadow .14s var(--ak-ease),border-color .14s var(--ak-ease),background-color .14s var(--ak-ease)}.ak-lead-submit{border:0;background:var(--ak-color);color:#fff}.ak-lead-skip{border:1px solid rgba(15,23,42,.12);background:#fff;color:#344054}.ak-lead-submit:hover:not(:disabled),.ak-lead-skip:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(15,23,42,.12)}.ak-lead-submit:disabled{opacity:.58;cursor:not-allowed}.ak-lead-error{border:1px solid #fecaca;border-radius:10px;background:#fef2f2;color:#991b1b;padding:8px 10px;font-size:13px;animation:akWidgetMessageIn .2s var(--ak-ease-emphasis) both}.ak-lead-success{border:1px solid #a7f3d0;border-radius:10px;background:#ecfdf3;color:#0f5f2d;padding:10px;font-size:13px;font-weight:700;animation:akWidgetMessageIn .22s var(--ak-ease-emphasis) both}" +
      ".ak-thinking{justify-self:start;border-radius:999px;background:#fff;border:1px solid rgba(15,23,42,.08);padding:8px 11px;color:#667085;font-size:13px;animation:akWidgetThinking 1.15s ease-in-out infinite,akWidgetMessageIn .2s var(--ak-ease-emphasis) both}" +
      ".ak-form{display:grid;grid-template-columns:1fr auto;gap:8px;padding:12px;border-top:1px solid rgba(15,23,42,.08);background:#fff}.ak-input{min-height:42px;border:1px solid rgba(15,23,42,.14);border-radius:12px;padding:0 12px;font:14px inherit;outline:none;transition:border-color .14s var(--ak-ease),box-shadow .14s var(--ak-ease),opacity .14s var(--ak-ease)}.ak-input:focus{border-color:var(--ak-color);box-shadow:0 0 0 3px rgba(53,92,255,.14)}.ak-send{min-height:42px;border:0;border-radius:12px;background:var(--ak-color);color:#fff;padding:0 14px;font:700 14px inherit;cursor:pointer;transition:transform .14s var(--ak-ease),box-shadow .14s var(--ak-ease),opacity .14s var(--ak-ease)}.ak-send:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 10px 24px rgba(53,92,255,.22)}.ak-send:disabled{opacity:.58;cursor:not-allowed}.ak-footer{border-top:1px solid rgba(15,23,42,.08);background:#fff;padding:8px 12px;color:#98a2b3;font-size:11px;text-align:center}" +
      ".ak-launcher:focus-visible,.ak-close:focus-visible,.ak-input:focus-visible,.ak-send:focus-visible,.ak-lead-submit:focus-visible,.ak-lead-skip:focus-visible,.ak-lead-field input:focus-visible,.ak-lead-field textarea:focus-visible{outline:3px solid rgba(53,92,255,.24);outline-offset:2px}" +
      "@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important}.ak-launcher:hover,.ak-close:hover,.ak-lead-submit:hover:not(:disabled),.ak-lead-skip:hover,.ak-send:hover:not(:disabled){transform:none}}" +
      "@media(max-width:520px){.ak-shell{left:14px;right:14px;bottom:14px}.ak-panel{width:100%;height:min(620px,calc(100vh - 28px))}.ak-launch-wrap{justify-items:end}}" +
      "</style>";
  }

  function messageHtml(message) {
    const media = [
      message.audioUrl ? "<div class=\\"ak-media\\"><audio controls preload=\\"metadata\\" src=\\"" + absoluteUrl(message.audioUrl) + "\\"></audio></div>" : "",
      message.videoUrl ? "<div class=\\"ak-media\\"><video controls playsinline preload=\\"metadata\\" src=\\"" + absoluteUrl(message.videoUrl) + "\\"></video></div>" : ""
    ].join("");
    return "<div class=\\"ak-message ak-" + message.role + "\\">" + escapeHtml(message.content) + media + "</div>";
  }

  function leadFieldHtml(field) {
    if (field === "message") {
      return "<label class=\\"ak-lead-field\\">Message<textarea name=\\"message\\" maxlength=\\"1000\\" placeholder=\\"What would you like help with?\\"></textarea></label>";
    }
    const labels = {
      name: "Name",
      email: "Email",
      phone: "Phone"
    };
    const types = {
      name: "text",
      email: "email",
      phone: "tel"
    };
    const maxLengths = {
      name: "120",
      email: "254",
      phone: "32"
    };
    const autocomplete = {
      name: "name",
      email: "email",
      phone: "tel"
    };
    return "<label class=\\"ak-lead-field\\">" + labels[field] + "<input name=\\"" + field + "\\" type=\\"" + types[field] + "\\" maxlength=\\"" + maxLengths[field] + "\\" autocomplete=\\"" + autocomplete[field] + "\\" /></label>";
  }

  function leadCaptureHtml() {
    if (state.leadSubmitted) {
      return "<div class=\\"ak-lead-success\\">Thanks. Your details were saved for follow-up.</div>";
    }
    const capture = state.leadCapture;
    if (!capture || !capture.required) {
      return "";
    }
    const fields = Array.isArray(capture.fields) && capture.fields.length
      ? capture.fields.filter(field => ["name", "email", "phone", "message"].includes(field))
      : ["name", "email", "phone", "message"];
    const fieldHtml = fields.map(leadFieldHtml).join("");
    const error = state.leadError ? "<div class=\\"ak-lead-error\\">" + escapeHtml(state.leadError) + "</div>" : "";
    return "<form class=\\"ak-lead-card ak-lead-form\\"><h3>Continue with a team member</h3><p>" + escapeHtml(capture.promptText || "Share your contact details and the team can follow up.") + "</p>" + error + "<div class=\\"ak-lead-grid\\">" + fieldHtml + "</div><div class=\\"ak-lead-actions\\"><button class=\\"ak-lead-submit\\" type=\\"submit\\" " + (state.leadSubmitting ? "disabled" : "") + ">" + (state.leadSubmitting ? "Saving..." : "Submit details") + "</button><button class=\\"ak-lead-skip\\" type=\\"button\\">Skip</button></div></form>";
  }

  function render() {
    const config = state.config;
    const initials = config?.initials || "AI";
    const brandLabel = config?.brandName || config?.displayName || "Avatar";
    const avatarMark = config?.customLogoUrl
      ? "<img class=\\"ak-logo\\" src=\\"" + escapeHtml(config.customLogoUrl) + "\\" alt=\\"" + escapeHtml(brandLabel) + " logo\\" />"
      : "<div class=\\"ak-avatar\\">" + escapeHtml(initials) + "</div>";
    const footer = config?.hideAvatarKitBranding ? "" : "<div class=\\"ak-footer\\">Powered by AvatarKit</div>";
    const greeting = config?.greetingEnabled && config.greetingText
      ? "<div class=\\"ak-greeting\\">" + escapeHtml(config.greetingText) + "</div>"
      : "";
    const body = state.error
      ? "<div class=\\"ak-error\\">" + escapeHtml(state.error) + "</div>"
      : state.messages.length === 0
        ? "<div class=\\"ak-empty\\">Ask a text question and this published avatar will answer here.</div>"
        : state.messages.map(messageHtml).join("") + leadCaptureHtml();
    const thinking = state.loading ? "<div class=\\"ak-thinking\\">" + escapeHtml(state.realtimeStatus && state.realtimeStatus !== "idle" ? state.realtimeStatus : "Thinking...") + "</div>" : "";
    const shell = state.open
      ? "<div class=\\"ak-panel\\"><div class=\\"ak-header\\"><div class=\\"ak-identity\\">" + avatarMark + "<div class=\\"ak-title\\"><strong>" + escapeHtml(brandLabel) + "</strong><span>" + escapeHtml(config?.displayName || config?.role || "Published avatar") + "</span></div></div><button class=\\"ak-close\\" type=\\"button\\" aria-label=\\"Minimize widget\\">x</button></div><div class=\\"ak-body\\">" + body + thinking + "</div><form class=\\"ak-form\\"><input class=\\"ak-input\\" name=\\"message\\" type=\\"text\\" autocomplete=\\"off\\" maxlength=\\"800\\" placeholder=\\"Ask a question\\" " + (state.loading ? "disabled" : "") + " /><button class=\\"ak-send\\" type=\\"submit\\" " + (state.loading ? "disabled" : "") + ">Send</button></form>" + footer + "</div>"
      : "<div class=\\"ak-launch-wrap\\">" + greeting + "<button class=\\"ak-launcher\\" type=\\"button\\" aria-label=\\"Open widget\\">" + escapeHtml(initials) + "</button></div>";
    shadow.innerHTML = css() + "<div class=\\"ak-shell\\">" + shell + "</div>";
    bindEvents();
  }

  function bindEvents() {
    const launcher = shadow.querySelector(".ak-launcher");
    if (launcher) {
      launcher.addEventListener("click", () => {
        state.open = true;
        render();
      });
    }
    const close = shadow.querySelector(".ak-close");
    if (close) {
      close.addEventListener("click", () => {
        state.open = false;
        render();
      });
    }
    const form = shadow.querySelector(".ak-form");
    if (form) {
      form.addEventListener("submit", event => {
        event.preventDefault();
        const input = shadow.querySelector(".ak-input");
        const value = input ? input.value.trim() : "";
        if (!value || state.loading) {
          return;
        }
        if (input) {
          input.value = "";
        }
        sendMessage(value);
      });
    }
    const leadForm = shadow.querySelector(".ak-lead-form");
    if (leadForm) {
      leadForm.addEventListener("submit", event => {
        event.preventDefault();
        if (state.leadSubmitting) {
          return;
        }
        const data = new FormData(leadForm);
        submitLead({
          name: String(data.get("name") || "").trim(),
          email: String(data.get("email") || "").trim(),
          phone: String(data.get("phone") || "").trim(),
          message: String(data.get("message") || "").trim()
        });
      });
    }
    const leadSkip = shadow.querySelector(".ak-lead-skip");
    if (leadSkip) {
      leadSkip.addEventListener("click", () => {
        state.leadCapture = null;
        state.leadError = "";
        render();
      });
    }
  }

  async function loadConfig() {
    state.visitorId = getVisitorId();
    try {
      const response = await fetch(apiBaseUrl + "/api/widget/" + encodeURIComponent(avatarId) + "/config", {
        method: "GET",
        mode: "cors"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Widget is not available.");
      }
      state.config = {
        ...payload,
        theme: requestedTheme,
        position: requestedPosition
      };
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Widget could not load.";
      state.config = {
        displayName: "Avatar unavailable",
        role: "Widget blocked",
        initials: "AI",
        greetingEnabled: false,
        greetingText: "",
        theme: requestedTheme,
        position: requestedPosition,
        primaryColor: "#355cff",
        brandName: null,
        customLogoUrl: null,
        hideAvatarKitBranding: false,
        defaultOutputMode: "text"
      };
    }
    render();
  }

  async function sendMessage(content) {
    state.error = "";
    state.loading = true;
    state.realtimeStatus = "thinking";
    state.messages.push({ role: "visitor", content });
    render();
    if (!state.realtimeFailed) {
      const realtimeOk = await sendRealtimeMessage(content);
      if (realtimeOk) {
        state.loading = false;
        state.realtimeStatus = "waiting";
        render();
        return;
      }
    }
    try {
      const response = await fetch(apiBaseUrl + "/api/widget/" + encodeURIComponent(avatarId) + "/message", {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          conversationId: state.conversationId,
          visitorId: state.visitorId,
          outputMode: state.config?.defaultOutputMode || "text"
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Avatar response failed.");
      }
      state.conversationId = payload.conversationId || state.conversationId;
      state.visitorId = payload.visitorId || state.visitorId;
      state.messages.push({
        role: "avatar",
        content: payload.avatarMessage?.content || "",
        audioUrl: payload.avatarMessage?.audioUrl || null,
        videoUrl: payload.avatarMessage?.videoUrl || null
      });
      if (payload.avatarMessage?.leadCapture?.required) {
        state.leadCapture = payload.avatarMessage.leadCapture;
        state.leadSubmitted = false;
        state.leadError = "";
      }
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Avatar response failed.";
    } finally {
      state.loading = false;
      state.realtimeStatus = "idle";
      render();
    }
  }

  async function ensureRealtimeSession() {
    if (state.realtimeSessionId) {
      return true;
    }
    try {
      const response = await fetch(apiBaseUrl + "/api/widget/" + encodeURIComponent(avatarId) + "/realtime/session", {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: state.visitorId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Realtime session failed.");
      }
      state.realtimeSessionId = payload.sessionId || "";
      state.conversationId = payload.conversationId || state.conversationId;
      state.visitorId = payload.visitorId || state.visitorId;
      return Boolean(state.realtimeSessionId);
    } catch {
      state.realtimeFailed = true;
      return false;
    }
  }

  async function readRealtimeStream(response) {
    const reader = response.body && response.body.getReader ? response.body.getReader() : null;
    if (!reader) {
      return false;
    }
    const decoder = new TextDecoder();
    let buffer = "";
    let finalReceived = false;
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      buffer += decoder.decode(result.value, { stream: true });
      const parts = buffer.split("\\n\\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        const dataLine = part.split("\\n").find(line => line.indexOf("data: ") === 0);
        if (!dataLine) {
          continue;
        }
        const event = JSON.parse(dataLine.slice(6));
        if (event.type === "avatar.status" && event.status) {
          state.realtimeStatus = event.status;
          render();
        }
        if (event.type === "avatar.answer.final") {
          state.messages.push({
            role: "avatar",
            content: event.text || "",
            audioUrl: null,
            videoUrl: null,
            realtimeMessageId: event.messageId || ""
          });
          finalReceived = true;
          render();
        }
        if (event.type === "avatar.audio.ready" && event.audioUrl) {
          const message = [...state.messages].reverse().find(item => item.role === "avatar" && item.realtimeMessageId === event.messageId);
          if (message) {
            message.audioUrl = event.audioUrl;
            render();
          }
        }
        if (event.type === "avatar.video.ready" && event.videoUrl) {
          const message = [...state.messages].reverse().find(item => item.role === "avatar" && item.realtimeMessageId === event.messageId);
          if (message) {
            message.videoUrl = event.videoUrl;
            render();
          }
        }
        if (event.type === "lead.capture.requested") {
          state.leadCapture = {
            required: true,
            fields: event.fields || ["name", "email", "phone", "message"],
            promptText: event.promptText || "Share your contact details and the team can follow up."
          };
          state.leadSubmitted = false;
          state.leadError = "";
          render();
        }
        if (event.type === "error") {
          throw new Error(event.message || "Realtime message failed.");
        }
      }
    }
    return finalReceived;
  }

  async function sendRealtimeMessage(content) {
    const hasSession = await ensureRealtimeSession();
    if (!hasSession) {
      return false;
    }
    try {
      const response = await fetch(apiBaseUrl + "/api/widget/" + encodeURIComponent(avatarId) + "/realtime/sessions/" + encodeURIComponent(state.realtimeSessionId) + "/message", {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          outputMode: state.config?.defaultOutputMode || "text"
        })
      });
      if (!response.ok) {
        throw new Error("Realtime message failed.");
      }
      const streamed = await readRealtimeStream(response);
      return streamed;
    } catch {
      state.realtimeFailed = true;
      state.realtimeStatus = "idle";
      return false;
    }
  }

  async function submitLead(values) {
    const hasAnyValue = Object.values(values).some(value => String(value || "").trim());
    if (!hasAnyValue) {
      state.leadError = "Enter at least one contact detail or message.";
      render();
      return;
    }
    state.leadSubmitting = true;
    state.leadError = "";
    render();
    try {
      const response = await fetch(apiBaseUrl + "/api/widget/" + encodeURIComponent(avatarId) + "/lead", {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: state.conversationId,
          ...values
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Lead details could not be saved.");
      }
      state.leadSubmitted = true;
      state.leadCapture = null;
      state.leadError = "";
    } catch (error) {
      state.leadError = error instanceof Error ? error.message : "Lead details could not be saved.";
    } finally {
      state.leadSubmitting = false;
      render();
    }
  }

  loadConfig();
})();`
