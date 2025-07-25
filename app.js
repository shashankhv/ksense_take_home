// Configuration constants
const CONFIG = {
  baseUrl: "https://assessment.ksensetech.com/api/patients",
  submitUrl: "https://assessment.ksensetech.com/api/submit-assessment",
  apiKey: "ak_403b1123f792d2c2597d87ec986053d67d884ab2352848f1",
  limit: 10,
  maxRetries: 8
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function calculateBloodPressureRisk(bloodPressure) {
  if (!bloodPressure || typeof bloodPressure !== 'string') {
    return 0;
  }

  const cleanBP = bloodPressure.trim();
  const bpParts = cleanBP.split('/');
  
  if (bpParts.length !== 2) {
    return 0;
  }

  const systolicStr = bpParts[0].trim();
  const diastolicStr = bpParts[1].trim();
  
  if (!systolicStr || !diastolicStr) {
    return 0;
  }

  const systolic = parseInt(systolicStr);
  const diastolic = parseInt(diastolicStr);

  if (isNaN(systolic) || isNaN(diastolic) || systolic <= 0 || diastolic <= 0 || systolic > 300 || diastolic > 200) {
    return 0;
  }

  if (systolic >= 140 || diastolic >= 90) {
    return 3;
  }

  if ((systolic >= 130 && systolic <= 139) || (diastolic >= 80 && diastolic <= 89)) {
    return 2;
  }

  if (systolic >= 120 && systolic <= 129 && diastolic < 80) {
    return 1;
  }

  if (systolic < 120 && diastolic < 80) {
    return 0;
  }

  if (systolic < 120 && diastolic >= 90) {
    return 3;
  }
  if (systolic < 120 && diastolic >= 80) {
    return 2;
  }

  return 0;
}

function calculateTemperatureRisk(temperature) {
  if (temperature === null || temperature === undefined || temperature === '') {
    return 0;
  }

  const temp = parseFloat(temperature);
  if (isNaN(temp)) {
    return 0;
  }

  if (temp >= 101.0) {
    return 2;
  }

  if (temp >= 99.6 && temp <= 100.9) {
    return 1;
  }

  return 0;
}

function calculateAgeRisk(age) {
  if (age === null || age === undefined || age === '') {
    return 0;
  }

  const ageStr = typeof age === 'string' ? age.trim() : age.toString();
  
  if (!ageStr) {
    return 0;
  }

  const ageNum = parseInt(ageStr);
  
  if (isNaN(ageNum) || ageNum <= 0 || ageNum > 150) {
    return 0;
  }

  if (ageNum > 65) {
    return 2;
  }

  return 1;
}

function calculateTotalRiskScore(patient) {
  const bpRisk = calculateBloodPressureRisk(patient.blood_pressure);
  const tempRisk = calculateTemperatureRisk(patient.temperature);
  const ageRisk = calculateAgeRisk(patient.age);
  
  return {
    bloodPressureRisk: bpRisk,
    temperatureRisk: tempRisk,
    ageRisk: ageRisk,
    totalRisk: bpRisk + tempRisk + ageRisk
  };
}

function isValidBloodPressure(bloodPressure) {
  return bloodPressure && 
         typeof bloodPressure === 'string' &&
         bloodPressure.split('/').length === 2 &&
         !isNaN(parseInt(bloodPressure.split('/')[0])) &&
         !isNaN(parseInt(bloodPressure.split('/')[1]));
}

function isValidTemperature(temperature) {
  return temperature !== null && 
         temperature !== undefined && 
         temperature !== '' &&
         !isNaN(parseFloat(temperature));
}

function isValidAge(age) {
  return age !== null && 
         age !== undefined && 
         age !== '' &&
         !isNaN(parseInt(age));
}

function hasDataQualityIssues(patient) {
  const bpValid = isValidBloodPressure(patient.blood_pressure);
  const tempValid = isValidTemperature(patient.temperature);
  const ageValid = isValidAge(patient.age);
  
  return !bpValid || !tempValid || !ageValid;
}

function hasFever(patient) {
  const temp = parseFloat(patient.temperature);
  return !isNaN(temp) && temp >= 99.6;
}

function isHighRisk(riskScores) {
  return riskScores.totalRisk >= 4;
}

function processPatient(patient) {
  const riskScores = calculateTotalRiskScore(patient);
  
  return {
    patientId: patient.patient_id,
    riskScores: riskScores,
    hasDataQualityIssues: hasDataQualityIssues(patient),
    hasFever: hasFever(patient),
    isHighRisk: isHighRisk(riskScores)
  };
}

function categorizePatients(patients) {
  const highRiskPatients = [];
  const feverPatients = [];
  const dataQualityIssues = [];

  patients.forEach(patient => {
    const processedPatient = processPatient(patient);
    
    if (processedPatient.hasDataQualityIssues) {
      dataQualityIssues.push(processedPatient.patientId);
    }
    
    if (processedPatient.hasFever) {
      feverPatients.push(processedPatient.patientId);
    }
    
    if (processedPatient.isHighRisk) {
      highRiskPatients.push(processedPatient.patientId);
    }
  });

  return {
    high_risk_patients: highRiskPatients,
    fever_patients: feverPatients,
    data_quality_issues: dataQualityIssues
  };
}

async function fetchPageWithRetry(page, retryCount = 0) {
  const url = `${CONFIG.baseUrl}?page=${page}&limit=${CONFIG.limit}`;

  try {
    const response = await fetch(url, {
      method: "get",
      headers: {
        "x-api-key": CONFIG.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (retryCount < CONFIG.maxRetries) {
      const waitTime = Math.pow(2, retryCount) * 1000;
      await delay(waitTime);
      return fetchPageWithRetry(page, retryCount + 1);
    } else {
      throw error;
    }
  }
}

async function fetchAllPatientData() {
  const maxOverallRetries = 5;
  let overallRetryCount = 0;
  
  while (overallRetryCount < maxOverallRetries) {
    const allData = [];
    
    const firstPageData = await fetchPageWithRetry(1);
    allData.push(...(firstPageData.data || firstPageData));
    
    const pagination = firstPageData.pagination;
    const totalPages = pagination ? pagination.totalPages : 1;
    const totalRecords = pagination ? pagination.total : allData.length;

    for (let page = 2; page <= totalPages; page++) {
      try {
        const pageData = await fetchPageWithRetry(page);
        allData.push(...(pageData.data || pageData));
      } catch (error) {
        console.error(`Skipping page ${page}: ${error.message}`);
      }
    }
    
    if (allData.length >= totalRecords) {
      return allData;
    } else {
      overallRetryCount++;
      
      if (overallRetryCount < maxOverallRetries) {
        const retryDelay = 2000 * overallRetryCount;
        await delay(retryDelay);
      }
    }
  }
  
  const allData = [];
  const firstPageData = await fetchPageWithRetry(1);
  allData.push(...(firstPageData.data || firstPageData));
  
  const pagination = firstPageData.pagination;
  const totalPages = pagination ? pagination.totalPages : 1;
  
  for (let page = 2; page <= totalPages; page++) {
    try {
      const pageData = await fetchPageWithRetry(page);
      allData.push(...(pageData.data || pageData));
    } catch (error) {
      console.error(`Skipping page ${page}: ${error.message}`);
    }
  }
  
  return allData;
}

async function submitAssessment(results) {
  try {
    const response = await fetch(CONFIG.submitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CONFIG.apiKey,
      },
      body: JSON.stringify(results)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
    
  } catch (error) {
    console.error("Error submitting assessment:", error);
    throw error;
  }
}

async function runHealthcareAssessment() {
  try {
    const patientData = await fetchAllPatientData();
    const results = categorizePatients(patientData);
    
    const submissionData = {
      high_risk_patients: results.high_risk_patients,
      fever_patients: results.fever_patients,
      data_quality_issues: results.data_quality_issues
    };

    const assessmentResult = await submitAssessment(submissionData);
    
    return {
      patientData: patientData,
      results: results,
      assessmentResult: assessmentResult
    };

  } catch (error) {
    console.error("Fatal error in healthcare assessment:", error);
    throw error;
  }
}

runHealthcareAssessment();
