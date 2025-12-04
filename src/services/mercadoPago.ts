import axios from "axios";

const CLIENT_ID = "8186287233979854";
const CLIENT_SECRET = "YRvH9bX3lgcHH6k6pGrs1YFKCJVcui5r";
const MERCADO_PAGO_API = "https://api.mercadopago.com/v1";
const OAUTH_URL = "https://api.mercadopago.com/oauth/token";

let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

// Gerar um ID único simples
function generateIdempotencyKey() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Gerar Access Token
async function getAccessToken() {
    const now = Date.now();

    if (cachedAccessToken && now < tokenExpiresAt) {
        return cachedAccessToken;
    }

    try {
        console.log("🔐 Gerando novo Access Token...");

        const response = await axios.post(OAUTH_URL, null, {
            params: {
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: "client_credentials",
            },
        });

        cachedAccessToken = response.data.access_token;
        tokenExpiresAt = now + response.data.expires_in * 1000 - 60000;

        console.log("✅ Access Token gerado com sucesso!");
        return cachedAccessToken;
    } catch (error: any) {
        console.error("❌ Erro ao gerar Access Token:", error.response?.data || error.message);
        throw new Error("Falha ao autenticar com Mercado Pago");
    }
}

type PaymentRequest = {
    amount: number;
    description: string;
    email: string;
};

type PixResponse = {
    qrCode: string;
    qrCodeBase64: string;
    transactionId: string;
    status: string;
};

export async function generatePixQrCode(paymentData: PaymentRequest): Promise<PixResponse> {
    try {
        console.log("📍 Gerando QR Code PIX com dados:", paymentData);

        const accessToken = await getAccessToken();
        const idempotencyKey = generateIdempotencyKey();

        const response = await axios.post(
            `${MERCADO_PAGO_API}/payments`,
            {
                transaction_amount: paymentData.amount,
                description: paymentData.description,
                payment_method_id: "pix",
                payer: {
                    email: paymentData.email,
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "X-Idempotency-Key": idempotencyKey,
                },
            }
        );

        console.log("✅ Resposta do Mercado Pago:", response.data);

        const qrCode = response.data.point_of_interaction?.transaction_data?.qr_code;
        const qrCodeBase64 = response.data.point_of_interaction?.transaction_data?.qr_code_base64;
        const transactionId = response.data.id;
        const status = response.data.status;

        if (!qrCode || !qrCodeBase64) {
            throw new Error(
                "QR Code não encontrado na resposta. Resposta: " +
                JSON.stringify(response.data)
            );
        }

        return {
            qrCode,
            qrCodeBase64,
            transactionId,
            status,
        };
    } catch (error: any) {
        console.error("❌ Erro completo:", error);
        console.error("📋 Detalhes da resposta:", error.response?.data);

        const errorMessage =
            error.response?.data?.message ||
            error.response?.data?.error?.message ||
            error.message ||
            "Erro desconhecido";

        throw new Error(errorMessage);
    }
}

export async function checkPaymentStatus(transactionId: string) {
    try {
        const accessToken = await getAccessToken();

        const response = await axios.get(
            `${MERCADO_PAGO_API}/payments/${transactionId}`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        return response.data.status;
    } catch (error) {
        console.error("Erro ao verificar status do pagamento:", error);
        return null;
    }
}
