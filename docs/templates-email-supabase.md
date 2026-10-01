# Modelos de e-mail do Supabase (texto neutro, vale para todas as empresas)

Os e-mails de confirmação de cadastro e de nova senha são os mesmos para todas as empresas da plataforma,
por isso o texto não cita nenhuma empresa.

1. Supabase → Authentication → Emails → SMTP Settings: troque o **Sender name** para `CRM de vendas`.
2. Supabase → Authentication → Emails → Templates: em cada modelo, cole o **Subject** e o **Body** abaixo.

---

## Confirm signup (confirmar cadastro)

**Subject:**
Confirme seu cadastro no CRM de vendas

**Body:**
```html
<h2>Confirme seu cadastro</h2>
<p>Olá! Recebemos um pedido de acesso ao CRM de vendas com este e-mail.</p>
<p><a href="{{ .ConfirmationURL }}">Clique aqui para confirmar seu e-mail</a></p>
<p>Depois da confirmação, entre com seu e-mail e senha. Se o seu acesso precisar de aprovação, o administrador da sua empresa será avisado.</p>
<p>Se você não fez esse pedido, pode ignorar esta mensagem.</p>
```

---

## Reset password (redefinir senha)

**Subject:**
Crie uma nova senha para o CRM de vendas

**Body:**
```html
<h2>Nova senha</h2>
<p>Recebemos um pedido para criar uma nova senha para a sua conta no CRM de vendas.</p>
<p><a href="{{ .ConfirmationURL }}">Clique aqui para criar sua nova senha</a></p>
<p>O link vale por pouco tempo e só pode ser usado uma vez. Se você não pediu isso, ignore esta mensagem: sua senha atual continua valendo.</p>
```

---

## Change email address (troca de e-mail)

**Subject:**
Confirme seu novo e-mail no CRM de vendas

**Body:**
```html
<h2>Confirme seu novo e-mail</h2>
<p>Recebemos um pedido para trocar o e-mail da sua conta no CRM de vendas para {{ .NewEmail }}.</p>
<p><a href="{{ .ConfirmationURL }}">Clique aqui para confirmar a troca</a></p>
```
