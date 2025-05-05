mkdir -p ~/certs/local-website
cd ~/certs/local-website

openssl req -x509 -out cert.pem -keyout key.pem \
  -newkey rsa:2048 -nodes -sha256 \
  -subj "/CN=local.website.com" \
  -addext "subjectAltName=DNS:local.website.com" \
  -days 365

echo "Made certificate for local.website.com"