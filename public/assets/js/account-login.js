document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const banner = document.getElementById("login-banner");
  banner.hidden = true;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    await Api.post("/api/customers/login", {
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
