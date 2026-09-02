function showProfileMessage(isError, message) {
  const errorEl = document.getElementById("profile-banner");
  const successEl = document.getElementById("profile-success");
  errorEl.hidden = !isError;
  successEl.hidden = isError;
  (isError ? errorEl : successEl).textContent = message;
}

document.addEventListener("DOMContentLoaded", async () => {
  const { customer } = await Api.get("/api/customers/me");
  if (!customer) {
    location.href = "/account/login.html";
    return;
  }
  document.getElementById("name").value = customer.name;
  document.getElementById("email").value = customer.email;

  document.getElementById("name-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await Api.patch("/api/customers/me", { name: e.target.name.value });
      showProfileMessage(false, "個人資料已更新。");
    } catch (err) {
      showProfileMessage(true, err.message);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.newPassword.value !== form.confirmPassword.value) {
      showProfileMessage(true, "兩次輸入的新密碼不一致，請重新確認。");
      return;
    }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await Api.patch("/api/customers/me", {
        currentPassword: form.currentPassword.value,
        newPassword: form.newPassword.value,
      });
      form.reset();
      showProfileMessage(false, "密碼已更新，下次登入請使用新密碼。");
    } catch (err) {
      showProfileMessage(true, err.message);
    } finally {
      btn.disabled = false;
    }
  });
});
