let originalEmail = "";

function showProfileMessage(isError, message) {
  const errorEl = document.getElementById("profile-banner");
  const successEl = document.getElementById("profile-success");
  errorEl.hidden = !isError;
  successEl.hidden = isError;
  (isError ? errorEl : successEl).textContent = message;
}

function toggleEmailPasswordRow() {
  const emailInput = document.getElementById("email");
  const row = document.getElementById("email-password-row");
  row.hidden = emailInput.value.trim().toLowerCase() === originalEmail;
}

document.addEventListener("DOMContentLoaded", async () => {
  const { customer } = await Api.get("/api/customers/me");
  if (!customer) {
    location.href = "/account/login.html";
    return;
  }
  document.getElementById("name").value = customer.name;
  document.getElementById("email").value = customer.email;
  originalEmail = customer.email;

  document.getElementById("email").addEventListener("input", toggleEmailPasswordRow);

  document.getElementById("name-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const newEmail = form.email.value.trim().toLowerCase();
    const emailChanged = newEmail !== originalEmail;

    if (emailChanged && !form.currentPasswordForEmail.value) {
      showProfileMessage(true, "變更 Email 需要輸入目前密碼。");
      return;
    }

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const { customer: updated } = await Api.patch("/api/customers/me", {
        name: form.name.value,
        email: newEmail,
        currentPassword: emailChanged ? form.currentPasswordForEmail.value : undefined,
      });
      originalEmail = updated.email;
      form.currentPasswordForEmail.value = "";
      toggleEmailPasswordRow();
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
