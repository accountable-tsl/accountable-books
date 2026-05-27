# Custom Domain Setup Guide

This guide walks you through setting up the custom domain `api-staging.getaccountable.com` for your Fly.io staging deployment.

## 🚀 Quick Setup

### 1. Deploy the Application

```bash
# Deploy with custom domain configuration
./scripts/deploy-fly-staging.sh deploy
```

### 2. Configure DNS

Add a CNAME record in your DNS provider (Cloudflare, Route53, etc.):

```
Type: CNAME
Name: api-staging
Value: accountable-books-api-staging.fly.dev
TTL: 300 (or Auto)
```

### 3. Configure SSL Certificate

```bash
# Configure the custom domain and SSL certificate
./scripts/deploy-fly-staging.sh domain
```

### 4. Verify Setup

```bash
# Check certificate status
fly certs show api-staging.getaccountable.com --app accountable-books-api-staging

# Test the endpoint
curl -I https://api-staging.getaccountable.com/health/ready
```

## 🔧 Manual Configuration

If the automatic setup doesn't work, you can configure manually:

### Add Custom Domain

```bash
# Add the custom domain
fly certs add api-staging.getaccountable.com --app accountable-books-api-staging
```

### Check Certificate Status

```bash
# List all certificates
fly certs list --app accountable-books-api-staging

# Check specific certificate
fly certs show api-staging.getaccountable.com --app accountable-books-api-staging
```

### Troubleshooting

If the certificate shows as "pending" or "error":

1. **Verify DNS**: Ensure the CNAME record is properly configured
2. **Wait for Propagation**: DNS changes can take up to 24 hours
3. **Check DNS**: Use `dig` or `nslookup` to verify:
   ```bash
   dig api-staging.getaccountable.com
   nslookup api-staging.getaccountable.com
   ```

## 🌐 Environment Variables

The custom domain automatically sets these environment variables:

```toml
[env]
  BASE_DOMAIN = "getaccountable.com"
  BACKEND_URL = "https://api-staging.getaccountable.com"
  FRONTEND_URL = "https://app-staging.getaccountable.com"
  COOKIE_DOMAIN = ".getaccountable.com"
```

## 🔍 Verification

### Health Check

```bash
# Test the health endpoint
curl https://api-staging.getaccountable.com/health/ready
```

Expected response:

```json
{
  "ok": true,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0"
}
```

### SSL Certificate

```bash
# Check SSL certificate
openssl s_client -connect api-staging.getaccountable.com:443 -servername api-staging.getaccountable.com
```

## 🚨 Common Issues

### Certificate Pending

If the certificate shows as "pending":

1. **Check DNS**: Verify CNAME record is correct
2. **Wait**: DNS propagation can take time
3. **Retry**: Run the domain command again:
   ```bash
   ./scripts/deploy-fly-staging.sh domain
   ```

### DNS Resolution Issues

If the domain doesn't resolve:

1. **Check CNAME**: Ensure it points to `accountable-books-api-staging.fly.dev`
2. **TTL**: Lower TTL values for faster propagation
3. **Provider**: Some DNS providers have different propagation times

### Environment Variables Not Set

If the custom domain environment variables aren't working:

1. **Redeploy**: The variables are set in `fly.staging.toml`
2. **Check Override**: Values in `fly.staging.toml` override `.env.staging`
3. **Verify**: Check current environment variables:
   ```bash
   fly config show --app accountable-books-api-staging
   ```

## 📝 Next Steps

Once the custom domain is working:

1. **Update Frontend**: Point your frontend to the new API URL
2. **Update Documentation**: Update any references to the old URL
3. **Monitor**: Keep an eye on certificate expiration (auto-renewed by Fly.io)
4. **Production**: Use the same process for production domains

## 🔗 Related Documentation

- [Fly.io Custom Domains](https://fly.io/docs/networking/custom-domains/)
- [Fly.io SSL Certificates](https://fly.io/docs/networking/custom-domains-with-fly/)
- [Main Deployment Guide](../FLY_README.md)
