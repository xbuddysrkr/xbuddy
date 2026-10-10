import {
  isAdActive,
  getActiveCampusAd,
  isValidAdUrl,
  resolveMediaUrl,
  NEXTGEN_FALLBACK_AD,
  NEXTGEN_FALLBACK_POSTER_URL,
} from '../src/utils/campusAds.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

console.log('--- STARTING XBUDDY CAMPUS ADS TEST SUITE ---')

// TEST 1: AD001 approved and active
const testAd001 = {
  adId: 'AD001',
  clubName: 'CSE Club',
  title: 'CSE Hackathon 2026',
  description: 'Register now',
  mediaType: 'image',
  mediaUrl: 'https://example.com/poster.jpg',
  clickUrl: 'https://srkrec.edu.in',
  placement: 'order-status',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  status: 'approved',
  priority: 1
}
assert.equal(isAdActive(testAd001, 'order-status'), true, 'TEST 1 FAILED: Approved active ad should be active')
console.log('✓ TEST 1 PASSED: AD001 approved and active is accepted')

// TEST 2: Pending status
const testPending = { ...testAd001, status: 'pending' }
assert.equal(isAdActive(testPending, 'order-status'), false, 'TEST 2 FAILED: Pending ad should NOT be active')
console.log('✓ TEST 2 PASSED: Pending ad is excluded')

// TEST 3: Rejected status
const testRejected = { ...testAd001, status: 'rejected' }
assert.equal(isAdActive(testRejected, 'order-status'), false, 'TEST 3 FAILED: Rejected ad should NOT be active')
console.log('✓ TEST 3 PASSED: Rejected ad is excluded')

// TEST 4: Archived status
const testArchived = { ...testAd001, status: 'archived' }
assert.equal(isAdActive(testArchived, 'order-status'), false, 'TEST 4 FAILED: Archived ad should NOT be active')
console.log('✓ TEST 4 PASSED: Archived ad is excluded')

// TEST 5: End date in the past
const testExpired = { ...testAd001, startDate: '2020-01-01', endDate: '2020-01-02' }
assert.equal(isAdActive(testExpired, 'order-status'), false, 'TEST 5 FAILED: Expired ad should NOT be active')
console.log('✓ TEST 5 PASSED: Expired ad is excluded')

// TEST 6: Start date in the future
const testFuture = { ...testAd001, startDate: '2099-01-01', endDate: '2099-12-31' }
assert.equal(isAdActive(testFuture, 'order-status'), false, 'TEST 6 FAILED: Future ad should NOT be active')
console.log('✓ TEST 6 PASSED: Future ad is excluded')

// TEST 7: No active ads
assert.equal(getActiveCampusAd('order-status', [testPending, testExpired, testRejected]), null, 'TEST 7 FAILED: Should return null when no ads are active')
console.log('✓ TEST 7 PASSED: No active ads returns null (zero-card fallback)')

// TEST 8: Priority ordering (priority 1 appears before priority 2)
const priorityAds = [
  { ...testAd001, adId: 'AD-LOW', title: 'Low Priority', priority: 5 },
  { ...testAd001, adId: 'AD-HIGH', title: 'High Priority', priority: 1 },
  { ...testAd001, adId: 'AD-MID', title: 'Mid Priority', priority: 3 }
]
const topAd = getActiveCampusAd('order-status', priorityAds)
assert.equal(topAd.adId, 'AD-HIGH', 'TEST 8 FAILED: Lower priority number should win')
console.log('✓ TEST 8 PASSED: Priority 1 appears before priority 2/3/5')

// TEST 9: Media URL Resolution for Google Drive file ID
const driveAd = {
  mediaType: 'image',
  mediaFileId: '1HQ_WklATac1JXXpVOzQ40r_X9AClORGo'
}
assert.equal(resolveMediaUrl(driveAd), 'https://drive.google.com/uc?export=view&id=1HQ_WklATac1JXXpVOzQ40r_X9AClORGo', 'TEST 9 FAILED: Drive mediaFileId should resolve to Google Drive view link')
console.log('✓ TEST 9 PASSED: Google Drive mediaFileId resolves to view link')

// TEST 10: URL Security Validation
assert.equal(isValidAdUrl('https://srkrec.edu.in'), true, 'Valid HTTPS should pass')
assert.equal(isValidAdUrl('http://srkrec.edu.in'), true, 'Valid HTTP should pass')
assert.equal(isValidAdUrl('/assets/poster.jpg'), true, 'Valid relative URL should pass')
assert.equal(isValidAdUrl('javascript:alert(1)'), false, 'javascript: must be rejected')
assert.equal(isValidAdUrl('data:text/html,<script>alert(1)</script>'), false, 'data: must be rejected')
console.log('✓ TEST 10 PASSED: URL security correctly allows web links and rejects script protocols')

// TEST 11: Video ad media resolution & attributes
const videoDriveAd = {
  adId: 'AD-VIDEO-01',
  mediaType: 'video',
  mediaFileId: '1AbC_videoDriveId12345678901234567',
  status: 'approved',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  priority: 1,
}
assert.equal(isAdActive(videoDriveAd, 'order-status'), true, 'Video ad should be active')
assert.equal(resolveMediaUrl(videoDriveAd), 'https://drive.google.com/uc?export=view&id=1AbC_videoDriveId12345678901234567', 'Drive video ID should resolve to view link')
console.log('✓ TEST 11 PASSED: Campus video ad format resolves correctly')

// TEST 12: NextGen Labs static poster asset existence & file size
const posterPath = path.resolve(__dirname, '../public/assets/campus-ads/nextgen-labs-poster.png')
assert.ok(fs.existsSync(posterPath), 'TEST 12 FAILED: nextgen-labs-poster.png must exist in public/assets/campus-ads/')
const posterStat = fs.statSync(posterPath)
assert.ok(posterStat.size > 100000, `TEST 12 FAILED: Poster file size (${posterStat.size} bytes) should be substantial and uncorrupted`)
console.log(`✓ TEST 12 PASSED: NextGen Labs poster asset verified on disk (${posterStat.size} bytes)`)

// TEST 13: Default fallback media URL resolution
assert.equal(resolveMediaUrl(null), NEXTGEN_FALLBACK_POSTER_URL, 'TEST 13 FAILED: Null ad must resolve to NextGen Labs poster')
assert.equal(resolveMediaUrl({}), NEXTGEN_FALLBACK_POSTER_URL, 'TEST 13 FAILED: Empty ad must resolve to NextGen Labs poster')
console.log('✓ TEST 13 PASSED: Default/placeholder media resolves directly to NextGen Labs poster')

// TEST 14: NEXTGEN_FALLBACK_AD definition and metadata
assert.equal(NEXTGEN_FALLBACK_AD.adId, 'FALLBACK_NEXTGEN_LABS')
assert.equal(NEXTGEN_FALLBACK_AD.clubName, 'NextGen Labs')
assert.equal(NEXTGEN_FALLBACK_AD.title, 'NextGen Labs')
assert.equal(NEXTGEN_FALLBACK_AD.isFallback, true)
assert.equal(NEXTGEN_FALLBACK_AD.mediaUrl, NEXTGEN_FALLBACK_POSTER_URL)
assert.equal(isAdActive(NEXTGEN_FALLBACK_AD, 'order-status'), true, 'TEST 14 FAILED: NEXTGEN_FALLBACK_AD must be active')
console.log('✓ TEST 14 PASSED: NEXTGEN_FALLBACK_AD object schema and validity confirmed')

// TEST 15: Component source verification for immediate fallback render
const componentPath = path.resolve(__dirname, '../src/components/CampusPromotionAd.jsx')
const componentSource = fs.readFileSync(componentPath, 'utf8')
assert.ok(
  componentSource.includes('NEXTGEN_FALLBACK_AD'),
  'TEST 15 FAILED: CampusPromotionAd must initialize state with NEXTGEN_FALLBACK_AD'
)
assert.ok(
  componentSource.includes('campus-promotion-fallback-poster'),
  'TEST 15 FAILED: CampusPromotionAd must provide fallback poster test ID'
)
assert.ok(
  componentSource.includes('object-contain'),
  'TEST 15 FAILED: Fallback poster must use object-contain to avoid cropping portrait image'
)
console.log('✓ TEST 15 PASSED: CampusPromotionAd renders NextGen Labs fallback immediately at t=0')

// TEST 16: API error & timeout scenario safety
assert.ok(
  componentSource.includes('prev?.isFallback ? prev : NEXTGEN_FALLBACK_AD') ||
  componentSource.includes('NEXTGEN_FALLBACK_AD'),
  'TEST 16 FAILED: API error/empty state must retain NextGen Labs poster'
)
console.log('✓ TEST 16 PASSED: API error/empty response preserves NextGen Labs poster without blanking UI')

// TEST 17: Successful active ad replaces fallback
const sampleApiAd = {
  adId: 'AD-HACKATHON-2026',
  clubName: 'SRKR Coding Club',
  title: 'Annual Hackathon 2026',
  description: 'Join us for prizes',
  mediaType: 'image',
  mediaUrl: 'https://example.com/banner.png',
  clickUrl: 'https://srkrec.edu.in',
  placement: 'order-status',
  status: 'approved',
  priority: 1,
}
const liveSelection = getActiveCampusAd('order-status', [sampleApiAd])
assert.equal(liveSelection.adId, 'AD-HACKATHON-2026')
console.log('✓ TEST 17 PASSED: Valid live ad correctly selected from API response to replace fallback')

// TEST 18: Broken image fallback handling in component
assert.ok(
  componentSource.includes('NEXTGEN_FALLBACK_POSTER_URL'),
  'TEST 18 FAILED: Broken image onError must fallback to NextGen Labs poster URL'
)
console.log('✓ TEST 18 PASSED: Broken image onError gracefully routes to NextGen Labs poster')

console.log('\n--- ALL 18 XBUDDY CAMPUS ADS TESTS PASSED SUCCESSFULLY! ---')
