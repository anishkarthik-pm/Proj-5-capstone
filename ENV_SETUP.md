# Environment Variables Setup Guide

## Recommended Configuration Based on Your Quota

Based on your Gemini API quota, here are the recommended models and setup:

### ✅ **Best Choice: `gemini-2.5-flash-lite`** (Currently Set)

**Why this is recommended:**
- ✅ **Available**: 0/10 RPM, 0/250K TPM, 0/20 RPD (all limits available)
- ✅ **Good balance**: Fast response times with good quality
- ✅ **Cost-effective**: Lower token costs than Pro models
- ✅ **High throughput**: 250K tokens per minute
- ✅ **Daily limit**: 20 requests per day (good for development/testing)

**Limits:**
- Requests Per Minute (RPM): 10
- Tokens Per Minute (TPM): 250,000
- Requests Per Day (RPD): 20

---

### Alternative Options

#### 1. **`gemini-3-flash`** (If you need more power)
- **Available**: 0/5 RPM, 0/250K TPM, 0/20 RPD
- **Better for**: More complex reasoning tasks
- **Trade-off**: Lower RPM (5 vs 10) but more capable

#### 2. **`gemini-2.5-flash`** (NOT RECOMMENDED - Quota Exceeded)
- ❌ **Currently unavailable**: RPD exceeded (21/20), RPM at limit (5/5)
- ⚠️ **Do not use** until quota resets

#### 3. **`gemini-2.5-flash-tts`** (For Text-to-Speech only)
- **Category**: Multi-modal generative models
- **Use case**: Only if you need TTS functionality
- **Limits**: 0/3 RPM, 0/10K TPM, 0/10 RPD

---

## Environment Variables Setup

### For Local Development (`.env.local`)

Create a `.env.local` file in your project root:

```env
# Gemini API Configuration
GOOGLE_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.5-flash-lite

# Optional: You can also use NEXT_PUBLIC_LLM_MODEL (both are supported)
# NEXT_PUBLIC_LLM_MODEL=gemini-2.5-flash-lite

# Optional: LLM Provider (defaults to gemini)
# NEXT_PUBLIC_LLM_PROVIDER=gemini
```

### For Vercel Deployment

Set these environment variables in your Vercel project settings:

1. Go to your Vercel project → Settings → Environment Variables
2. Add/Update these variables:

| Variable Name | Value | Environment |
|--------------|-------|-------------|
| `GOOGLE_API_KEY` | `AIzaSyCrFKytZwOzNENy5pFCEnshCuq...` | All Environments |
| `GEMINI_MODEL` | `gemini-2.5-flash-lite` | All Environments |

**Note:** The code now supports both `GEMINI_MODEL` and `NEXT_PUBLIC_LLM_MODEL` for flexibility.

---

## Model Name Format

The model names should match exactly as shown in your Google AI Studio:
- ✅ `gemini-2.5-flash-lite`
- ✅ `gemini-3-flash`
- ✅ `gemini-2.5-flash` (when quota available)
- ✅ `gemini-2.5-flash-tts`

---

## Usage Recommendations

### For Development/Testing:
- **Use**: `gemini-2.5-flash-lite`
- **Reason**: Good balance of speed, quality, and available quota

### For Production (Low Traffic):
- **Use**: `gemini-2.5-flash-lite`
- **Reason**: 20 requests/day is sufficient for low-traffic apps

### For Production (Higher Traffic):
- **Consider**: Request quota increase from Google
- **Or**: Use `gemini-3-flash` if you need fewer but more powerful requests

---

## Troubleshooting

### If you get "Model not found" errors:
1. Check that the model name matches exactly (case-sensitive)
2. Verify the model is available in your quota dashboard
3. The code will automatically try fallback models: `gemini-2.5-flash-lite` → `gemini-3-flash` → `gemini-2.5-flash`

### If you hit rate limits:
- **RPM limit**: Wait 1 minute between requests
- **RPD limit**: Wait until the next day or request quota increase
- **TPM limit**: Reduce the size of your prompts/responses

---

## Current Configuration Status

✅ **Code Updated**: Now supports `GEMINI_MODEL` environment variable  
✅ **Fallback Logic**: Automatically tries available models if primary fails  
✅ **Default Model**: Set to `gemini-2.5-flash-lite` (matches your current setup)  
✅ **Dynamic Routes**: API routes won't be called during build time

---

## Next Steps

1. ✅ Your Vercel environment variables are already set correctly
2. ✅ Code has been updated to use `GEMINI_MODEL`
3. 🔄 **Redeploy** your Vercel project to apply the changes
4. ✅ The build should now succeed without model errors
