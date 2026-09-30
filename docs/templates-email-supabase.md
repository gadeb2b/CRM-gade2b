# Modelos de e-mail do Supabase (CRM Gade2B)

Colar em: Supabase → Authentication → Emails → Templates.
Em cada modelo, troque o **Subject** e o **Body** (message body) pelo texto abaixo.

---

## Confirm signup (confirmar cadastro)

**Subject:**
Confirme seu cadastro no CRM Gade2B

**Body:**
```html
<h2>Confirme seu cadastro</h2>
<p>Olá! Recebemos um pedido de acesso ao CRM da Gade2B com este e-mail.</p>
<p><a href="{{ .ConfirmationURL }}">Clique aqui para confirmar seu e-mail</a></p>
<p>Depois da confirmação, seu acesso ainda precisa ser aprovado pelo administrador.</p>
<p>Se você não fez esse pedido, pode ignorar esta mensagem.</p>
```

---

## Reset password (redefinir senha)

**Subject:**
Crie uma nova senha para o CRM Gade2B

**Body:**
```html
<h2>Nova senha</h2>
<p>Recebemos um pedido para criar uma nova senha para sua conta no CRM da Gade2B.</p>
<p><a href="{{ .ConfirmationURL }}">Clique aqui para criar sua nova senha</a></p>
<p>Se você não pediu isso, ignore esta mensagem. Sua senha atual continua valendo.</p>
```

---

## Change email address (troca de e-mail)

**Subject:**
Confirme seu novo e-mail no CRM Gade2B

**Body:**
```html
<h2>Confirme seu novo e-mail</h2>
<p>Recebemos um pedido para trocar o e-mail da sua conta no CRM da Gade2B para {{ .NewEmail }}.</p>
<p><a href="{{ .ConfirmationURL }}">Clique aqui para confirmar a troca</a></p>
```
