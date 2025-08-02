// Credit/Debit Notes Module Tests
import { assert } from '../utils/testHelpers.js';
import { api } from '../../services/api/index.js';
import { notesDataTransformer } from '../../services/api/utils/notesDataTransformer.js';

export async function testNotesModule(options = {}) {
  const { verbose = false } = options;
  const results = { passed: [], failed: [] };
  
  console.log('\n📝 Testing Credit/Debit Notes Module...\n');
  
  // Test Suite 1: Data Transformer
  console.log('📋 Testing Data Transformer...');
  
  // Test 1.1: Transform Credit Note to Backend
  try {
    const frontendCreditNote = {
      note_type: 'credit',
      note_no: 'CN-123456',
      date: '2024-01-15',
      party_type: 'customer',
      party_id: 'cust-001',
      party_name: 'Test Customer',
      amount: '1000',
      tax_rate: '18',
      tax_amount: '180',
      total_amount: '1180',
      reason: 'discount',
      linked_invoice_id: 'inv-001',
      description: 'Test credit note'
    };
    
    const transformed = notesDataTransformer.transformCreditNoteToBackend(frontendCreditNote);
    
    assert(transformed.note_number === 'CN-123456', 'Should transform note_no to note_number');
    assert(transformed.note_date === '2024-01-15', 'Should transform date to note_date');
    assert(transformed.party_id === 'cust-001', 'Should preserve party_id');
    assert(transformed.amount === 1000, 'Should convert amount to number');
    assert(transformed.tax_rate === 18, 'Should convert tax_rate to number');
    assert(transformed.linked_invoice_id === 'inv-001', 'Should preserve linked_invoice_id');
    
    results.passed.push('Credit Note to Backend transformation');
    if (verbose) console.log('✅ Credit Note to Backend transformation passed');
  } catch (error) {
    results.failed.push({ test: 'Credit Note to Backend transformation', error: error.message });
    console.error('❌ Credit Note to Backend transformation failed:', error.message);
  }
  
  // Test 1.2: Transform Debit Note to Backend
  try {
    const frontendDebitNote = {
      note_type: 'debit',
      note_no: 'DN-123456',
      date: '2024-01-15',
      party_type: 'supplier',
      party_id: 'supp-001',
      party_name: 'Test Supplier',
      amount: '500',
      tax_rate: '12',
      tax_amount: '60',
      total_amount: '560',
      reason: 'late_payment',
      linked_invoice_id: 'pur-001',
      description: 'Late payment charges'
    };
    
    const transformed = notesDataTransformer.transformDebitNoteToBackend(frontendDebitNote);
    
    assert(transformed.note_number === 'DN-123456', 'Should transform note_no to note_number');
    assert(transformed.party_type === 'supplier', 'Should preserve party_type');
    assert(transformed.linked_purchase_id === 'pur-001', 'Should map linked_invoice_id to linked_purchase_id for debit notes');
    assert(transformed.reason === 'late_payment', 'Should preserve reason');
    
    results.passed.push('Debit Note to Backend transformation');
    if (verbose) console.log('✅ Debit Note to Backend transformation passed');
  } catch (error) {
    results.failed.push({ test: 'Debit Note to Backend transformation', error: error.message });
    console.error('❌ Debit Note to Backend transformation failed:', error.message);
  }
  
  // Test 1.3: Transform Backend Credit Note to Frontend
  try {
    const backendCreditNote = {
      id: 'note-001',
      note_number: 'CN-123456',
      note_date: '2024-01-15',
      party_type: 'customer',
      party_id: 'cust-001',
      party_name: 'Test Customer',
      amount: 1000,
      tax_rate: 18,
      tax_amount: 180,
      total_amount: 1180,
      reason: 'discount',
      linked_invoice_id: 'inv-001',
      linked_invoice: { invoice_number: 'INV-001' },
      status: 'approved',
      description: 'Test credit note'
    };
    
    const transformed = notesDataTransformer.transformCreditNoteToFrontend(backendCreditNote);
    
    assert(transformed.note_type === 'credit', 'Should set note_type to credit');
    assert(transformed.note_no === 'CN-123456', 'Should transform note_number to note_no');
    assert(transformed.date === '2024-01-15', 'Should transform note_date to date');
    assert(transformed.linked_invoice_no === 'INV-001', 'Should extract linked invoice number');
    
    results.passed.push('Backend Credit Note to Frontend transformation');
    if (verbose) console.log('✅ Backend Credit Note to Frontend transformation passed');
  } catch (error) {
    results.failed.push({ test: 'Backend Credit Note to Frontend transformation', error: error.message });
    console.error('❌ Backend Credit Note to Frontend transformation failed:', error.message);
  }
  
  // Test 1.4: Validate Note Data
  try {
    // Valid note
    const validNote = {
      party_id: 'party-001',
      amount: '100',
      reason: 'discount',
      date: '2024-01-15',
      tax_rate: 18
    };
    
    const validation = notesDataTransformer.validateNoteData(validNote);
    assert(validation.isValid === true, 'Valid note should pass validation');
    
    // Invalid note
    const invalidNote = {
      amount: '0',
      tax_rate: 35
    };
    
    const invalidValidation = notesDataTransformer.validateNoteData(invalidNote);
    assert(invalidValidation.isValid === false, 'Invalid note should fail validation');
    assert(invalidValidation.errors.includes('Party is required'), 'Should catch missing party');
    assert(invalidValidation.errors.includes('Valid amount is required'), 'Should catch invalid amount');
    
    results.passed.push('Note data validation');
    if (verbose) console.log('✅ Note data validation passed');
  } catch (error) {
    results.failed.push({ test: 'Note data validation', error: error.message });
    console.error('❌ Note data validation failed:', error.message);
  }
  
  // Test Suite 2: Credit Notes API Integration
  console.log('\n💳 Testing Credit Notes API...');
  
  // Test 2.1: Get Credit Note Reasons
  try {
    const response = await api.notes.credit.getReasons();
    assert(response.data, 'Should return reasons data');
    assert(Array.isArray(response.data), 'Reasons should be an array');
    
    results.passed.push('Get credit note reasons');
    if (verbose) console.log('✅ Get credit note reasons passed');
  } catch (error) {
    if (error.response?.status === 404) {
      if (verbose) console.log('⚠️  Credit note reasons endpoint not found');
    } else {
      results.failed.push({ test: 'Get credit note reasons', error: error.message });
      console.error('❌ Get credit note reasons failed:', error.message);
    }
  }
  
  // Test 2.2: Generate Credit Note Number
  try {
    const response = await api.notes.credit.generateNumber();
    if (response.data) {
      assert(response.data.note_number, 'Should return generated note number');
      results.passed.push('Generate credit note number');
      if (verbose) console.log('✅ Generate credit note number passed');
    }
  } catch (error) {
    if (error.response?.status === 404) {
      if (verbose) console.log('⚠️  Generate credit note number endpoint not found');
    } else {
      results.failed.push({ test: 'Generate credit note number', error: error.message });
      console.error('❌ Generate credit note number failed:', error.message);
    }
  }
  
  // Test Suite 3: Debit Notes API Integration
  console.log('\n📄 Testing Debit Notes API...');
  
  // Test 3.1: Get Debit Note Reasons
  try {
    const response = await api.notes.debit.getReasons();
    assert(response.data, 'Should return reasons data');
    assert(Array.isArray(response.data), 'Reasons should be an array');
    
    results.passed.push('Get debit note reasons');
    if (verbose) console.log('✅ Get debit note reasons passed');
  } catch (error) {
    if (error.response?.status === 404) {
      if (verbose) console.log('⚠️  Debit note reasons endpoint not found');
    } else {
      results.failed.push({ test: 'Get debit note reasons', error: error.message });
      console.error('❌ Get debit note reasons failed:', error.message);
    }
  }
  
  // Test Suite 4: Adjustment Transformation
  console.log('\n🔄 Testing Adjustments...');
  
  // Test 4.1: Transform Adjustment to Backend
  try {
    const adjustment = {
      invoice_id: 'inv-001',
      amount: '100',
      date: '2024-01-15',
      remarks: 'Partial adjustment'
    };
    
    const transformed = notesDataTransformer.transformAdjustmentToBackend(adjustment);
    
    assert(transformed.adjustment_amount === 100, 'Should convert amount to number');
    assert(transformed.adjustment_date === '2024-01-15', 'Should preserve date');
    assert(transformed.remarks === 'Partial adjustment', 'Should preserve remarks');
    
    results.passed.push('Adjustment transformation');
    if (verbose) console.log('✅ Adjustment transformation passed');
  } catch (error) {
    results.failed.push({ test: 'Adjustment transformation', error: error.message });
    console.error('❌ Adjustment transformation failed:', error.message);
  }
  
  // Test 4.2: Transform Pending Adjustments
  try {
    const pendingData = {
      party_id: 'party-001',
      party_name: 'Test Party',
      party_type: 'customer',
      total_pending_credit: 1000,
      total_pending_debit: 200,
      pending_notes: [{
        id: 'note-001',
        note_number: 'CN-001',
        note_date: '2024-01-15',
        remaining_amount: 500,
        note_type: 'credit'
      }]
    };
    
    const transformed = notesDataTransformer.transformPendingAdjustmentsToFrontend(pendingData);
    
    assert(transformed.net_adjustment === 800, 'Should calculate net adjustment');
    assert(transformed.pending_notes[0].note_no === 'CN-001', 'Should transform note_number to note_no');
    assert(transformed.pending_notes[0].amount === 500, 'Should use remaining_amount');
    
    results.passed.push('Pending adjustments transformation');
    if (verbose) console.log('✅ Pending adjustments transformation passed');
  } catch (error) {
    results.failed.push({ test: 'Pending adjustments transformation', error: error.message });
    console.error('❌ Pending adjustments transformation failed:', error.message);
  }
  
  // Summary
  const totalTests = results.passed.length + results.failed.length;
  console.log(`\n📝 Credit/Debit Notes Module Test Summary:`);
  console.log(`✅ Passed: ${results.passed.length}/${totalTests}`);
  console.log(`❌ Failed: ${results.failed.length}/${totalTests}`);
  
  if (results.failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    results.failed.forEach(({ test, error }) => {
      console.log(`  - ${test}: ${error}`);
    });
  }
  
  return results;
}

// Export for use in main test runner
window.testNotesModule = testNotesModule;