-- CreateIndex
CREATE INDEX "Annotation_xrayId_updatedAt_idx" ON "Annotation"("xrayId", "updatedAt");

-- CreateIndex
CREATE INDEX "Appointment_doctorId_dateTime_idx" ON "Appointment"("doctorId", "dateTime");

-- CreateIndex
CREATE INDEX "Appointment_patientId_dateTime_idx" ON "Appointment"("patientId", "dateTime");

-- CreateIndex
CREATE INDEX "Visit_patientId_visitDate_idx" ON "Visit"("patientId", "visitDate");

-- CreateIndex
CREATE INDEX "Xray_patientId_status_createdAt_idx" ON "Xray"("patientId", "status", "createdAt");
