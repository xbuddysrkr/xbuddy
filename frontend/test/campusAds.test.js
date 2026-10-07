import { isAdActive, getActiveCampusAd, isValidAdUrl, resolveMediaUrl } from '../src/utils/campusAds.js'
import assert from 'node:assert/strict'

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

console.log('--- ALL XBUDDY CAMPUS ADS TESTS PASSED SUCCESSFULLY! ---')
