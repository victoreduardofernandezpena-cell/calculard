export function formValues(form) {
  return Object.fromEntries(
    new FormData(form).entries().map(([key, value]) => [key, value === "" ? "" : Number(value) || value])
  );
}

export function validateForm(form, rules) {
  clearErrors(form);
  const values = formValues(form);
  const errors = {};

  Object.entries(rules).forEach(([name, rule]) => {
    const value = values[name];
    const isEmpty = value === "" || value === null || value === undefined;

    if (rule.required && isEmpty) {
      errors[name] = "Este campo es obligatorio.";
      return;
    }

    if (isEmpty) return;

    const number = Number(value);
    if (rule.number && Number.isNaN(number)) {
      errors[name] = "Ingresa un número válido.";
      return;
    }

    if (rule.min !== undefined && number < rule.min) {
      errors[name] = rule.minMessage || `Debe ser mayor o igual a ${rule.min}.`;
      return;
    }

    if (rule.max !== undefined && number > rule.max) {
      errors[name] = rule.maxMessage || `Debe ser menor o igual a ${rule.max}.`;
    }
  });

  Object.entries(errors).forEach(([name, message]) => {
    const field = form.elements[name];
    const label = field?.closest("label");
    const messageNode = form.querySelector(`[data-error-for="${name}"]`);
    label?.classList.add("field-invalid");
    if (messageNode) messageNode.textContent = message;
  });

  return { valid: Object.keys(errors).length === 0, values, errors };
}

export function clearErrors(form) {
  form.querySelectorAll(".field-invalid").forEach((node) => node.classList.remove("field-invalid"));
  form.querySelectorAll("[data-error-for]").forEach((node) => {
    node.textContent = "";
  });
}
