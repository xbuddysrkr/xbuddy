import assert from 'node:assert/strict'
import { parsePageRange, formatPagesToRange, resolveAllPages } from '../src/utils/pageRangeParser.js'
import { calcPriceBreakdown } from '../src/utils/pricing.js'

console.log('🧪 Starting Page Range & Custom Page Range Selection Test Suite...\n')

// Test 1: 9-page PDF + "1" => 1 selected page
{
  const res = parsePageRange('1', 9)
  assert.equal(res.valid, true)
  assert.deepEqual(res.selectedPages, [1])
  assert.equal(res.selectedPageCount, 1)
  assert.equal(res.pageRangeString, '1')
  console.log('✅ Test 1 Passed: 9-page PDF + "1" => exactly [1]')
}

// Test 2: 9-page PDF + "1,3" => 2 selected pages
{
  const res = parsePageRange('1,3', 9)
  assert.equal(res.valid, true)
  assert.deepEqual(res.selectedPages, [1, 3])
  assert.equal(res.selectedPageCount, 2)
  assert.equal(res.pageRangeString, '1,3')
  console.log('✅ Test 2 Passed: 9-page PDF + "1,3" => exactly [1,3]')
}

// Test 3: 9-page PDF + "1-3" => 3 selected pages
{
  const res = parsePageRange('1-3', 9)
  assert.equal(res.valid, true)
  assert.deepEqual(res.selectedPages, [1, 2, 3])
  assert.equal(res.selectedPageCount, 3)
  assert.equal(res.pageRangeString, '1-3')
  console.log('✅ Test 3 Passed: 9-page PDF + "1-3" => exactly [1,2,3]')
}

// Test 4: 9-page PDF + "1-3,7,9" => 5 selected pages
{
  const res = parsePageRange('1-3,7,9', 9)
  assert.equal(res.valid, true)
  assert.deepEqual(res.selectedPages, [1, 2, 3, 7, 9])
  assert.equal(res.selectedPageCount, 5)
  assert.equal(res.pageRangeString, '1-3,7,9')
  console.log('✅ Test 4 Passed: 9-page PDF + "1-3,7,9" => exactly [1,2,3,7,9]')
}

// Test 5: 9-page PDF + "2,4-6" => 4 selected pages
{
  const res = parsePageRange('2,4-6', 9)
  assert.equal(res.valid, true)
  assert.deepEqual(res.selectedPages, [2, 4, 5, 6])
  assert.equal(res.selectedPageCount, 4)
  assert.equal(res.pageRangeString, '2,4-6')
  console.log('✅ Test 5 Passed: 9-page PDF + "2,4-6" => exactly [2,4,5,6]')
}

// Test 6: 9-page PDF + whitespace and duplicates "1, 1, 3" => [1,3]
{
  const res = parsePageRange('1, 1, 3', 9)
  assert.equal(res.valid, true)
  assert.deepEqual(res.selectedPages, [1, 3])
  assert.equal(res.selectedPageCount, 2)
  console.log('✅ Test 6 Passed: 9-page PDF + "1, 1, 3" => deduplicated to [1,3]')
}

// Test 7: 9-page PDF + empty => 0 selected pages & validation error
{
  const res = parsePageRange('', 9)
  assert.equal(res.valid, false)
  assert.deepEqual(res.selectedPages, [])
  assert.equal(res.selectedPageCount, 0)
  assert.ok(res.error)
  console.log('✅ Test 7 Passed: 9-page PDF + empty string => 0 selected pages, valid=false')
}

// Test 8: 9-page PDF + "10" => validation error (exceeds total pages)
{
  const res = parsePageRange('10', 9)
  assert.equal(res.valid, false)
  assert.deepEqual(res.selectedPages, [])
  assert.equal(res.selectedPageCount, 0)
  assert.ok(res.error.includes('exceeds'))
  console.log('✅ Test 8 Passed: 9-page PDF + "10" => validation error (page exceeds total)')
}

// Test 9: Malformed inputs rejection: "0", "abc", "1-", "-3", "1--5"
{
  const badInputs = ['0', 'abc', '1-', '-3', '1--5', '1,,2', ',1', '1,']
  for (const bad of badInputs) {
    const res = parsePageRange(bad, 9)
    assert.equal(res.valid, false, `Expected ${bad} to be invalid`)
    assert.deepEqual(res.selectedPages, [])
    assert.equal(res.selectedPageCount, 0)
  }
  console.log('✅ Test 9 Passed: Malformed inputs ("0", "abc", "1-", "-3", "1--5", ",,") all safely rejected')
}

// Test 10: All Pages => resolveAllPages(9)
{
  const all = resolveAllPages(9)
  assert.deepEqual(all, [1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.equal(all.length, 9)
  console.log('✅ Test 10 Passed: All Pages resolves to [1, 2, 3, 4, 5, 6, 7, 8, 9]')
}

// Test 11: Pricing calculation verification
{
  // 9-page PDF + "1" page selected, B&W (₹2/page), 1 copy
  const customRes = parsePageRange('1', 9)
  const breakdown1 = calcPriceBreakdown({
    totalPages: 9,
    colorMode: 'bw',
    isDoubleSide: false,
    copies: 1,
    pageRange: 'custom',
    selectedPages: customRes.selectedPages,
  })
  // 1 page * ₹2/page * 1 copy = ₹2 printing cost + ₹1 digital processing fee (1-5 pages slab) = ₹3
  assert.equal(breakdown1.printablePages, 1)
  assert.equal(breakdown1.printingCost, 2)
  assert.equal(breakdown1.digitalProcessingFee, 1)
  assert.equal(breakdown1.totalAmount, 3)
  console.log('✅ Test 11 Passed: Pricing for 9-page PDF with Custom "1" => printingCost: ₹2, fee: ₹1, total: ₹3')

  // Empty custom range => ₹0
  const breakdownEmpty = calcPriceBreakdown({
    totalPages: 9,
    colorMode: 'bw',
    isDoubleSide: false,
    copies: 1,
    pageRange: 'custom',
    selectedPages: [],
  })
  assert.equal(breakdownEmpty.printablePages, 0)
  assert.equal(breakdownEmpty.printingCost, 0)
  assert.equal(breakdownEmpty.digitalProcessingFee, 0)
  assert.equal(breakdownEmpty.totalAmount, 0)
  assert.equal(breakdownEmpty.invalidSelection, true)
  console.log('✅ Test 12 Passed: Pricing for empty Custom Range => ₹0, invalidSelection: true')

  // All 9 pages => 9 * ₹2 = ₹18 + ₹2 digital fee (6-10 pages slab) = ₹20
  const breakdownAll = calcPriceBreakdown({
    totalPages: 9,
    colorMode: 'bw',
    isDoubleSide: false,
    copies: 1,
    pageRange: 'all',
    selectedPages: resolveAllPages(9),
  })
  assert.equal(breakdownAll.printablePages, 9)
  assert.equal(breakdownAll.printingCost, 18)
  assert.equal(breakdownAll.digitalProcessingFee, 2)
  assert.equal(breakdownAll.totalAmount, 20)
  console.log('✅ Test 13 Passed: Pricing for All 9 pages => printingCost: ₹18, fee: ₹2, total: ₹20')
}

console.log('\n🎉 ALL 13 TEST CASES PASSED PERFECTLY!\n')
