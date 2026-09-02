document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const banner = document.getElementById("register-banner");
  banner.hidden = true;

  if (e.target.password.value !== e.target.confirmPassword.value) {
    banner.hidden = false;
    banner.textContent = "兩次輸入的密碼不一致，請重新確認。";
    return;
  }

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    await Api.post("/api/customers/register", {
      name: e.target.name.value,
      email: e.target.email.value,
      password: e.target.password.value,
    });
    location.href = "/account/orders.html";
  } catch (err) {
    banner.hidden = false;
    banner.textContent = err.message;
    btn.disabled = false;
  }
});
