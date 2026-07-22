// ─────────────────────────────────────────────────────────────────────────
// Lightweight client-side i18n for the demo chrome (everything EXCEPT the
// Adyen Drop-in UI). Language is persisted in localStorage and shared across
// all pages. Only the payment-settings page exposes the toggle button, but
// every page applies the saved language on load.
//
// Usage in markup:
//   <span data-i18n="key">English fallback</span>        → textContent
//   <span data-i18n-html="key">…</span>                  → innerHTML
//   <input data-i18n-ph="key" />                         → placeholder attr
//   <span data-i18n-tip="key">i</span>                   → data-tip attr
//
// Usage in JS: window.t('key')  → translated string for current language.
//
// NOTE: deliberately NOT translated: the Drop-in itself, "Shopper Interaction",
// "RecurringProcessingModel", LPM/scheme proper names, currency/country codes,
// and raw API JSON logs.
// ─────────────────────────────────────────────────────────────────────────
(function () {
  const STORAGE_KEY = 'appLang';

  const I18N = {
    en: {
      // ── Common ──
      'common.logout': 'Logout',
      'common.backHome': '← Back to Home',
      'brand.subtitle': 'Select country, currency & amount to start checkout',

      // ── Login page ──
      'login.subtitle': 'Please sign in to continue',
      'login.signin': 'Sign In',
      'login.error': 'Invalid access code',
      'login.accessCode': 'Access Code',
      'login.locked': 'Too many failed attempts. Please try again later.',
      'login.yourIp': 'Your IP address:',
      'login.username': 'Username',
      'login.password': 'Password',
      'login.button': 'Login',

      // ── Payment settings ──
      'index.title': 'Payment Settings',
      'label.country': 'Country',
      'tip.country': "Shopper's country.\n\u200bSome payment methods are only available in certain countries.",
      'country.AU': '🇦🇺 Australia',
      'country.BE': '🇧🇪 Belgium',
      'country.BR': '🇧🇷 Brazil',
      'country.CA': '🇨🇦 Canada',
      'country.DK': '🇩🇰 Denmark',
      'country.FI': '🇫🇮 Finland',
      'country.FR': '🇫🇷 France',
      'country.DE': '🇩🇪 Germany',
      'country.HK': '🇭🇰 Hong Kong',
      'country.IT': '🇮🇹 Italy',
      'country.JP': '🇯🇵 Japan',
      'country.MY': '🇲🇾 Malaysia',
      'country.NL': '🇳🇱 Netherlands',
      'country.NZ': '🇳🇿 New Zealand',
      'country.NO': '🇳🇴 Norway',
      'country.SG': '🇸🇬 Singapore',
      'country.KR': '🇰🇷 South Korea',
      'country.ES': '🇪🇸 Spain',
      'country.SE': '🇸🇪 Sweden',
      'country.TH': '🇹🇭 Thailand',
      'country.GB': '🇬🇧 United Kingdom',
      'country.US': '🇺🇸 United States',
      'label.shopperLocale': 'Shopper Locale',
      'tip.shopperLocale': 'Language/locale of the Drop-in UI and redirect pages, e.g. en-US, zh-CN.',
      'label.currency': 'Currency',
      'tip.currency': 'Transaction currency.\nMust be supported by the chosen payment method, otherwise that method is filtered out.',
      'label.amount': 'Amount',
      'err.amount': 'Amount must be at least 0.01',
      'tip.shopperInteraction': 'Indicates if this is a one-time payment (Ecommerce) or a recurring transaction using an existing stored card (ContAuth).',
      'tip.recurringModel': 'How a stored card is charged:\n• CardOnFile (shopper-initiated payment)\n• Subscription (fixed schedule such as monthly, merchant-initiated)\n• UnscheduledCardOnFile (random schedule or amount, merchant-initiated)',
      'label.shopperRef': 'Shopper Reference',
      'tip.shopperRef': 'Your unique identifier for the shopper. \nUsed to store and retrieve their saved payment methods.',
      'label.merchantRef': 'Merchant Reference',
      'tip.merchantRef': 'Your unique reference for this payment used to match the transaction in your own system. Auto-generated if left empty.',
      'label.telephone': 'Telephone Number',
      'tip.telephone': "Shopper's phone number sent in the payments request. Used by some payment methods and risk checks.",
      'label.email': 'Email',
      'tip.email': "Shopper's email sent in the payments request. Used by some payment methods and receipts.",
      'err.email': 'Please enter a valid email address',
      'label.billingRequired': 'Billing Address Required',
      'tip.billingRequired': 'Require shopper to enter his billing address, for card payment only',
      'opt.fullAddress': 'Full address',
      'opt.postalOnly': 'Postal code only',
      'label.enableStore': 'Enable Store Details',
      'tip.enableStore': 'Show "save payment details" checkbox in the card form so the shopper can store their card.',
      'label.showStored': 'Show Stored Payment Methods',
      'tip.showStored': "Show the shopper's saved payment methods (stored cards) in Drop-in.",
      'label.threeDS': '3DS Mode',
      'tip.threeDS': "• Native = 3DS2 rendered in merchant's page.\n• Redirect = shopper is redirected to the issuer's authentication page.",
      'label.channel': 'Channel',
      'tip.channel': 'Platform where the payment happens (Web, iOS, Android). \nAffects which payment methods are returned and data used for 3DS flow (native or web).',
      'btn.continue': 'Start Checkout',
      'ph.optional': 'optional',
      'ph.autoGenerate': 'Leave empty to auto-generate',
      'ph.reusePrev': 'Enter the previous Shopper Reference',
      'note.remember': "Remember this Shopper Reference — you'll need it for recurring payment using stored card: ",
      'note.reuse': 'Enter the Shopper Reference you used in your first-time (tokenization) test, so the stored card can be reused.',

      // ── Test scenarios panel ──
      'preset.title': 'Test Scenarios',
      'preset.hint': 'Quickly configure the parameters for common test flows. Please select one for testing and click Start Checkout.',
      'preset.firstpay.title': '1. First-time card tokenization',
      'preset.firstpay.desc': 'Generates a new Shopper Reference.<br>Please also check "save for my next payment" in the next page.',
      'preset.reuse.title': '2. Pay with a stored card',
      'preset.reuse.desc': 'Enter the previous Shopper Reference.<br>You will see the stored card in the next page.',
      'preset.chargeback.title': '3. Test chargeback',
      'preset.chargeback.desc': 'Sends <b>holderName</b> parameter in /payment request that triggers a chargeback in test.<br>You might need to wait for hours to receive the chargeback webhook:',
      'preset.reset.title': 'Restore to default',
      'preset.reset.desc': 'Reset all settings back to their default values.',
      'cb.reminder': 'holderName = <b>{name}</b><br><br>On the next page, choose a <b>{scheme}</b> test card so the value matches the scheme.<br>For more dispute reason codes, see: <a href="https://docs.adyen.com/risk-management/understanding-disputes/dispute-reason-codes?tab=chargeback_1" target="_blank" rel="noopener">Dispute reason codes</a>',

      // ── Checkout page chrome ──
      'checkout.title': 'Checkout',
      'checkout.hintBanner': 'Maximize your browser to see all contents',
      'debug.console': 'Debug Console',
      'debug.sdkEvent': 'SDK Event',
      'debug.apiLog': 'API Log',
      'debug.backendApi': 'Backend API',
      'debug.sdkEvents': 'SDK Events',
      'debug.clear': 'Clear',
      'debug.clearLog': 'Clear log',
      'debug.freeze': 'Freeze redirect (pause before leaving page)',
      'debug.note': 'Note: these logs show requests from the <b>frontend to our backend</b>. The parameters sent to Adyen API may differ slightly.',
      'debug.emptyApi': 'No API calls yet. Interact with the payment form to see requests and responses.',
      'debug.emptyEvent': 'No SDK events yet. Interact with the payment form to see events.',
      'debug.paused': '⏸ Redirect paused — review the log above.',
      'debug.proceed': 'Proceed →',
      'debug.copy': 'Copy',
      'debug.copied': 'Copied!',
      'webhook.view': '↗ View transaction status in webhook',
      'feedback.text': 'Cannot find the payment method you want? Please <a id="feedback-btn" class="debug-feedback-link" href="mailto:support@adyen.com?subject=New%20Payment%20method%20request%20for%20Demo%20app&body=Payment%20method%EF%BC%9A%0D%0A%0D%0A%0D%0APlease%20kindly%20note%20that%20not%20all%20payment%20methods%20are%20available%20in%20the%20sandbox%20environment%2C%20e.g.%20Alipay%20and%20Wechat%20Pay%20must%20be%20tested%20in%20live%20environment.">feedback</a> to us.',
      'testcards.title': 'Test Cards',
      'testcards.hint': 'Expiry <b>03/30</b> &middot; CVC <b>737</b> (Amex <b>7373</b>)',

      // ── Result page ──
      'result.title': 'Payment Result',
      'result.subtitle': 'See the outcome of your payment below',
      'result.sub.Authorised': 'Your payment was successful.',
      'result.sub.Received': 'Your payment has been received and is being processed.',
      'result.sub.Pending': 'Your payment is pending confirmation.',
      'result.sub.Refused': 'Your payment was refused. Please try another method.',
      'result.sub.Cancelled': 'The payment was cancelled.',
      'result.sub.Error': 'Something went wrong while processing your payment.',
      'result.sub.Unknown': 'We could not determine the payment status.',
      'result.field.psp': 'PSP Reference',
      'result.field.merchant': 'Merchant Reference',
      'result.field.code': 'Result Code',
      'result.field.refusal': 'Refusal Reason',
      'result.field.error': 'Error',
      'result.newPayment': 'Start a new payment',
    },

    zh: {
      // ── Common ──
      'common.logout': '退出登录',
      'common.backHome': '← 返回首页',
      'brand.subtitle': '选择国家、货币和金额以开始结账',

      // ── Login page ──
      'login.subtitle': '请登录以继续',
      'login.signin': '登录',
      'login.error': '访问代码错误',
      'login.accessCode': '访问代码',
      'login.locked': '失败次数过多，请稍后再试。',
      'login.yourIp': '你的 IP 地址：',
      'login.username': '用户名',
      'login.password': '密码',
      'login.button': '登录',

      // ── Payment settings ──
      'index.title': '支付设置',
      'label.country': '国家',
      'tip.country': '购物者所在国家。\n\u200b部分支付方式仅在特定国家可用。',
      'country.AU': '🇦🇺 澳大利亚',
      'country.BE': '🇧🇪 比利时',
      'country.BR': '🇧🇷 巴西',
      'country.CA': '🇨🇦 加拿大',
      'country.DK': '🇩🇰 丹麦',
      'country.FI': '🇫🇮 芬兰',
      'country.FR': '🇫🇷 法国',
      'country.DE': '🇩🇪 德国',
      'country.HK': '🇭🇰 中国香港',
      'country.IT': '🇮🇹 意大利',
      'country.JP': '🇯🇵 日本',
      'country.MY': '🇲🇾 马来西亚',
      'country.NL': '🇳🇱 荷兰',
      'country.NZ': '🇳🇿 新西兰',
      'country.NO': '🇳🇴 挪威',
      'country.SG': '🇸🇬 新加坡',
      'country.KR': '🇰🇷 韩国',
      'country.ES': '🇪🇸 西班牙',
      'country.SE': '🇸🇪 瑞典',
      'country.TH': '🇹🇭 泰国',
      'country.GB': '🇬🇧 英国',
      'country.US': '🇺🇸 美国',
      'label.shopperLocale': '语言 / 地区',
      'tip.shopperLocale': 'Drop-in 界面和跳转页面的语言/地区，例如 en-US、zh-CN。',
      'label.currency': '货币',
      'tip.currency': '交易货币。\n必须被所选支付方式支持，否则该方式会被过滤掉。',
      'label.amount': '金额',
      'err.amount': '金额至少为 0.01',
      'tip.shopperInteraction': '表示这是一次性支付（Ecommerce），还是使用已保存卡片的循环交易（ContAuth）。',
      'tip.recurringModel': '已保存卡片的扣款方式：\n• CardOnFile（购物者发起的支付）\n• Subscription（固定周期，如每月，由商户发起）\n• UnscheduledCardOnFile（不固定周期或金额，由商户发起）',
      'label.shopperRef': 'Shopper Reference',
      'tip.shopperRef': '你为购物者设定的唯一标识。\n用于存储和读取其已保存的支付方式。',
      'label.merchantRef': 'Merchant Reference',
      'tip.merchantRef': '你为本次支付设定的唯一参考号，用于在自有系统中匹配交易。留空则自动生成。',
      'label.telephone': '电话号码',
      'tip.telephone': '在支付请求中发送的购物者电话号码。部分支付方式和风控检查会使用。',
      'label.email': '邮箱',
      'tip.email': '在支付请求中发送的购物者邮箱。部分支付方式和收据会使用。',
      'err.email': '请输入有效的邮箱地址',
      'label.billingRequired': '需要账单地址',
      'tip.billingRequired': '要求购物者输入账单地址，仅适用于卡支付。',
      'opt.fullAddress': '完整地址',
      'opt.postalOnly': '仅邮政编码',
      'label.enableStore': '启用保存卡信息',
      'tip.enableStore': '在卡片表单中显示"保存支付信息"选项，让购物者可以保存其卡片。',
      'label.showStored': '显示已保存的支付方式',
      'tip.showStored': '在 Drop-in 中显示购物者已保存的支付方式（已存卡片）。',
      'label.threeDS': '3DS 模式',
      'tip.threeDS': '• Native = 3DS2 在商户页面内渲染。\n• Redirect = 购物者被跳转到发卡行的验证页面。',
      'label.channel': '渠道',
      'tip.channel': '发生支付的平台（Web、iOS、Android）。\n会影响返回的支付方式以及 3DS 流程所用的数据（原生或网页）。',
      'btn.continue': '开始结账',
      'ph.optional': '可选',
      'ph.autoGenerate': '留空则自动生成',
      'ph.reusePrev': '输入之前使用的 Shopper Reference',
      'note.remember': '请记住这个 Shopper Reference —— 之后用已存卡片做循环支付时需要用到： ',
      'note.reuse': '请输入你在首次（令牌化）测试时使用的 Shopper Reference，这样才能复用已保存的卡片。',

      // ── Test scenarios panel ──
      'preset.title': '测试场景',
      'preset.hint': '快速配置常见测试流程的参数。请选择一个进行测试，然后点击"开始结账"。',
      'preset.firstpay.title': '1. 首次卡片令牌化',
      'preset.firstpay.desc': '生成一个新的 Shopper Reference。<br>请在下一页勾选"保存以便下次支付"。',
      'preset.reuse.title': '2. 使用已保存的卡支付',
      'preset.reuse.desc': '输入之前的 Shopper Reference。<br>你将在下一页看到已保存的卡片。',
      'preset.chargeback.title': '3. 测试拒付（Chargeback）',
      'preset.chargeback.desc': '在 /payment 请求中发送 <b>holderName</b> 参数，从而在测试环境触发拒付。<br>你可能需要等待数小时才能收到拒付 webhook',
      'preset.reset.title': '恢复默认',
      'preset.reset.desc': '将所有设置重置为默认值。',
      'cb.reminder': 'holderName = <b>{name}</b><br><br>在下一页请选择一张 <b>{scheme}</b> 测试卡，使该值与卡组织匹配。<br>更多争议原因码，请参见：<a href="https://docs.adyen.com/risk-management/understanding-disputes/dispute-reason-codes?tab=chargeback_1" target="_blank" rel="noopener">Dispute reason codes</a>',

      // ── Checkout page chrome ──
      'checkout.title': '结账',
      'checkout.hintBanner': '请最大化浏览器窗口以显示全部内容',
      'debug.console': '调试控制台',
      'debug.sdkEvent': 'SDK 事件',
      'debug.apiLog': 'API 日志',
      'debug.backendApi': '后端 API',
      'debug.sdkEvents': 'SDK 事件',
      'debug.clear': '清空',
      'debug.clearLog': '清空日志',
      'debug.freeze': '冻结跳转（离开页面前先暂停）',
      'debug.note': '注意：这些日志展示的是<b>从前端发往我们后端</b>的请求。发送给 Adyen API 的参数可能略有不同。',
      'debug.emptyApi': '暂无 API 调用。与支付表单交互即可查看请求与响应。',
      'debug.emptyEvent': '暂无 SDK 事件。与支付表单交互即可查看事件。',
      'debug.paused': '⏸ 跳转已暂停 —— 请查看上方日志。',
      'debug.proceed': '继续 →',
      'debug.copy': '复制',
      'debug.copied': '已复制！',
      'webhook.view': '↗ 在 webhook 中查看交易状态',
      'feedback.text': '找不到你想要的支付方式？请向我们<a id="feedback-btn" class="debug-feedback-link" href="mailto:support@adyen.com?subject=New%20Payment%20method%20request%20for%20Demo%20app&body=Payment%20method%EF%BC%9A%0D%0A%0D%0A%0D%0APlease%20kindly%20note%20that%20not%20all%20payment%20methods%20are%20available%20in%20the%20sandbox%20environment%2C%20e.g.%20Alipay%20and%20Wechat%20Pay%20must%20be%20tested%20in%20live%20environment.">反馈</a>。',
      'testcards.title': '测试卡',
      'testcards.hint': '有效期 <b>03/30</b> &middot; CVC <b>737</b>（Amex 为 <b>7373</b>）',

      // ── Result page ──
      'result.title': '支付结果',
      'result.subtitle': '在下方查看你的支付结果',
      'result.sub.Authorised': '你的支付已成功。',
      'result.sub.Received': '你的支付已收到，正在处理中。',
      'result.sub.Pending': '你的支付正在等待确认。',
      'result.sub.Refused': '你的支付被拒绝。请尝试其他方式。',
      'result.sub.Cancelled': '支付已取消。',
      'result.sub.Error': '处理你的支付时出现问题。',
      'result.sub.Unknown': '无法确定支付状态。',
      'result.field.psp': 'PSP Reference',
      'result.field.merchant': 'Merchant Reference',
      'result.field.code': 'Result Code',
      'result.field.refusal': '拒绝原因',
      'result.field.error': '错误',
      'result.newPayment': '发起新的支付',
    },
  };

  function getLang() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'zh' || saved === 'en' ? saved : 'en';
  }

  function translate(key, lang) {
    const l = lang || getLang();
    const dict = I18N[l] || I18N.en;
    if (dict[key] != null) return dict[key];
    if (I18N.en[key] != null) return I18N.en[key];
    return key;
  }

  function applyI18n(lang) {
    const l = lang || getLang();
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const v = translate(el.getAttribute('data-i18n'), l);
      if (v != null) el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const v = translate(el.getAttribute('data-i18n-html'), l);
      if (v != null) el.innerHTML = v;
    });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      const v = translate(el.getAttribute('data-i18n-ph'), l);
      if (v != null) el.setAttribute('placeholder', v);
    });
    document.querySelectorAll('[data-i18n-tip]').forEach((el) => {
      const v = translate(el.getAttribute('data-i18n-tip'), l);
      if (v != null) el.setAttribute('data-tip', v);
    });
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
    updateToggleLabels(l);
  }

  function setLang(lang) {
    const l = lang === 'zh' ? 'zh' : 'en';
    localStorage.setItem(STORAGE_KEY, l);
    applyI18n(l);
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: l } }));
  }

  function updateToggleLabels(lang) {
    const l = lang || getLang();
    document.querySelectorAll('[data-lang-toggle]').forEach((btn) => {
      // Show the language the user will switch TO.
      btn.textContent = l === 'zh' ? 'EN' : '中文';
    });
    updateLangSwitch(l);
  }

  // Segmented EN | 中文 control: highlight the active segment.
  function updateLangSwitch(lang) {
    const l = lang || getLang();
    document.querySelectorAll('[data-lang-switch] [data-lang]').forEach((seg) => {
      seg.classList.toggle('active', seg.getAttribute('data-lang') === l);
    });
  }

  function initLangSwitch(selector) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return;
    el.setAttribute('data-lang-switch', '');
    el.querySelectorAll('[data-lang]').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        e.preventDefault();
        setLang(seg.getAttribute('data-lang'));
      });
    });
    updateLangSwitch(getLang());
  }

  function initLangToggle(selector) {
    const btn = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!btn) return;
    btn.setAttribute('data-lang-toggle', '');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setLang(getLang() === 'zh' ? 'en' : 'zh');
    });
    updateToggleLabels(getLang());
  }

  // Expose API
  window.I18N = I18N;
  window.t = translate;
  window.getLang = getLang;
  window.setLang = setLang;
  window.applyI18n = applyI18n;
  window.initLangToggle = initLangToggle;
  window.initLangSwitch = initLangSwitch;

  // Apply saved language as soon as the DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyI18n());
  } else {
    applyI18n();
  }
})();
