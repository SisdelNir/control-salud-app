import re

with open("dashboard.js", "r") as f:
    text = f.read()

# 1. ADD SCHEDULER TO SWITCH
switch_old = """            case 'programmer':
                renderProgrammer();
                break;
            default:
                renderOverview(patientData);
        }"""
switch_new = """            case 'programmer':
                renderProgrammer();
                break;
            case 'scheduler':
                renderScheduler();
                break;
            default:
                renderOverview(patientData);
        }"""
text = text.replace(switch_old, switch_new)

# 2. ADD SCHEDULER FUNCTIONS
scheduler_code = """
    // --- MÓDULO AGENDAR CONSULTAS ---
    let currentCalDate = new Date(); // To track current month/year being viewed
    
    window.getAppointments = function() {
        const data = localStorage.getItem('appointments_data');
        return data ? JSON.parse(data) : [];
    };

    window.saveAppointment = function(appt) {
        const appointments = window.getAppointments();
        appointments.push(appt);
        // Sort chronologically
        appointments.sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));
        localStorage.setItem('appointments_data', JSON.stringify(appointments));
    };

    // Called when clicking "Agendar Consultas"
    window.renderScheduler = function() {
        const appointments = window.getAppointments();
        
        let year = currentCalDate.getFullYear();
        let month = currentCalDate.getMonth();
        
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        
        // Days logic
        const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // Generate Calendar Grid
        let cells = '';
        const dayHeaders = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => `<div class="calendar-day-header">${d}</div>`).join('');
        
        // Offset for previous month days
        const prevMonthDays = new Date(year, month, 0).getDate();
        for (let i = firstDay - 1; i >= 0; i--) {
            cells += `<div class="calendar-cell other-month"><span class="day-number">${prevMonthDays - i}</span></div>`;
        }
        
        const today = new Date();
        for (let i = 1; i <= daysInMonth; i++) {
            const isToday = i === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            const cellDateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            
            const cellAppts = appointments.filter(a => a.date === cellDateStr);
            const countBadge = cellAppts.length > 0 ? `<div class="appoint-count">${cellAppts.length} citas</div>` : '';
            
            cells += `
                <div class="calendar-cell ${isToday ? 'current-day' : ''}" onclick="window.renderDayDetail('${cellDateStr}')">
                    <span class="day-number">${i}</span>
                    ${countBadge}
                </div>
            `;
        }
        // Filler for end of month
        const remaining = 42 - (firstDay + daysInMonth); // standard 6 rows grid
        for (let i = 1; i <= remaining; i++) {
            cells += `<div class="calendar-cell other-month"><span class="day-number">${i}</span></div>`;
        }

        // Generate upcoming list (Top 10)
        const upcoming = appointments.filter(a => new Date(a.date + 'T' + a.time) >= new Date()).slice(0, 10);
        let upcomingHtml = '';
        if(upcoming.length === 0) {
            upcomingHtml = '<div style="text-align:center; opacity:0.5; margin-top:20px;">No hay citas agendadas próximas.</div>';
        } else {
            upcomingHtml = upcoming.map(u => `
                <div class="upcoming-item" onclick="window.selectPatientAndGoToConsultation('${u.qsl}')">
                    <div class="upcoming-date">${u.date} a las ${u.time}</div>
                    <div class="upcoming-name">${u.name}</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:5px;">ID: ${u.qsl}</div>
                </div>
            `).join('');
        }

        contentArea.innerHTML = `
            <div class="scheduler-container animate-in">
                <!-- COLUMNA IZQUIERDA: CALENDARIO -->
                <div class="calendar-widget" id="scheduler-main-panel">
                    <div class="calendar-header">
                        <div style="display:flex; align-items:center; gap: 15px;">
                            <button class="calendar-nav-btn" onclick="window.changeCalendarMonth(-1)">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                            </button>
                            <button class="calendar-nav-btn" onclick="window.changeCalendarMonth(1)">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                            <h3 style="margin:0; text-transform: uppercase;">${monthNames[month]} <span style="color:white; font-weight:300;">${year}</span></h3>
                        </div>
                        <button class="calendar-nav-btn" title="Hoy" onclick="window.currentCalDate = new Date(); window.renderScheduler();" style="width: auto; padding: 0 15px; font-weight:bold; font-size:14px;">HOY</button>
                    </div>
                    <div class="calendar-grid" style="margin-bottom: 10px;">
                        ${dayHeaders}
                    </div>
                    <div class="calendar-grid">
                        ${cells}
                    </div>
                </div>

                <!-- COLUMNA DERECHA: UPCOMING -->
                <div class="upcoming-list" style="display:flex; flex-direction:column;">
                    <h3 style="color:white; font-size: 20px; border-bottom: 2px solid rgba(255,255,255,0.1); padding-bottom: 15px; margin-bottom: 20px;">
                        Próximas 10 Citas
                    </h3>
                    <div style="flex:1; overflow-y:auto; padding-right:5px;">
                        ${upcomingHtml}
                    </div>
                </div>
            </div>
        `;
    };

    window.changeCalendarMonth = function(delta) {
        currentCalDate.setMonth(currentCalDate.getMonth() + delta);
        window.renderScheduler();
    };

    window.selectPatientAndGoToConsultation = function(qsl) {
        window.selectPatient(qsl);
        setTimeout(() => {
            Array.from(navItems).forEach(item => {
                if(item.getAttribute('data-section') === 'consultation') {
                    item.click();
                }
            });
        }, 100);
    };

    window.renderDayDetail = function(dateStr) {
        const appointments = window.getAppointments();
        const dayAppts = appointments.filter(a => a.date === dateStr);
        
        let timeslotsHtml = '';
        for(let i = 0; i <= 23; i++) {
            const timeStr = `${String(i).padStart(2, '0')}:00`;
            const apptBlock = dayAppts.find(a => a.time === timeStr);
            
            if(apptBlock) {
                timeslotsHtml += `
                    <div class="time-slot" onclick="window.selectPatientAndGoToConsultation('${apptBlock.qsl}')">
                        <div class="time-label">${timeStr}</div>
                        <div class="time-content booked">
                            <b>${apptBlock.name}</b> &mdash; Cita Programada (Clic para iniciar)
                        </div>
                    </div>
                `;
            } else {
                timeslotsHtml += `
                    <div class="time-slot" onclick="window.promptSchedulePatient('${dateStr}', '${timeStr}')">
                        <div class="time-label">${timeStr}</div>
                        <div class="time-content">
                            Disponible + (Clic para agendar cita)
                        </div>
                    </div>
                `;
            }
        }

        const panel = document.getElementById('scheduler-main-panel');
        if(!panel) return;
        
        panel.innerHTML = `
            <div class="calendar-header">
                <div style="display:flex; align-items:center; gap: 15px;">
                    <button class="calendar-nav-btn" onclick="window.renderScheduler()" style="width: auto; padding: 0 15px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px;"><polyline points="15 18 9 12 15 6"></polyline></svg> Volver
                    </button>
                    <h3 style="margin:0; font-size:20px; color:white;">Programación para el <span style="color:var(--accent);">${dateStr}</span></h3>
                </div>
            </div>
            <div class="day-detail-view">
                ${timeslotsHtml}
            </div>
        `;
    };

    window.promptSchedulePatient = function(dateStr, timeStr) {
        // First choice: New or Existing?
        const mainOverlay = document.createElement('div');
        mainOverlay.id = 'scheduler-modal';
        mainOverlay.style.position = 'fixed';
        mainOverlay.style.top = '0';
        mainOverlay.style.left = '0';
        mainOverlay.style.width = '100%';
        mainOverlay.style.height = '100%';
        mainOverlay.style.background = 'rgba(0,0,0,0.85)';
        mainOverlay.style.display = 'flex';
        mainOverlay.style.alignItems = 'center';
        mainOverlay.style.justifyContent = 'center';
        mainOverlay.style.zIndex = '99999';
        mainOverlay.style.backdropFilter = 'blur(5px)';

        mainOverlay.innerHTML = `
            <div class="widget-card animate-in" style="background: #0f172a; padding: 40px; border-radius: 24px; border: 2px solid rgba(16, 185, 129, 0.4); text-align: center; max-width: 450px; width:100%;">
                <h3 style="color: white; font-size: 24px; margin-bottom: 15px;">Agendar Cita a las ${timeStr}</h3>
                <p style="color: rgba(255,255,255,0.7); margin-bottom: 30px; font-size: 16px;">Elija una opción para vincular la cita del ${dateStr}.</p>
                
                <button onclick="window.scheduleNewPatient('${dateStr}', '${timeStr}')" style="width: 100%; border-radius: 12px; padding: 18px; font-size: 16px; font-weight: bold; cursor: pointer; margin-bottom: 15px; background: rgba(59, 130, 246, 0.15); border: 2px solid #3b82f6; color: #60a5fa; transition: all 0.2s;">
                    Registrar Paciente Nuevo
                </button>
                
                <button onclick="window.scheduleSearchPatient('${dateStr}', '${timeStr}')" style="width: 100%; border-radius: 12px; padding: 18px; font-size: 16px; font-weight: bold; cursor: pointer; margin-bottom: 25px; background: rgba(16, 185, 129, 0.15); border: 2px solid #10b981; color: #34d399; transition: all 0.2s;">
                    Paciente Existente (Buscar)
                </button>
                
                <button onclick="document.body.removeChild(document.getElementById('scheduler-modal'))" style="background: none; border: none; font-size: 14px; text-decoration: underline; color: rgba(255,255,255,0.5); cursor: pointer;">Cancelar</button>
            </div>
        `;
        document.body.appendChild(mainOverlay);
    };

    window.scheduleSearchPatient = function(dateStr, timeStr) {
        document.body.removeChild(document.getElementById('scheduler-modal'));
        
        const key = getDocPatientsKey();
        const patients = JSON.parse(localStorage.getItem(key) || '[]');
        
        let selectHtml = '<div style="max-height:300px; overflow-y:auto;text-align:left;">';
        if(patients.length === 0) {
            selectHtml += '<p style="color:white;">No hay pacientes registrados.</p>';
        } else {
            patients.forEach(qsl => {
                const name = localStorage.getItem(`patient_name_${qsl}`) || 'Paciente';
                const data = getPatientData(qsl);
                selectHtml += `
                    <div style="padding:15px; border-bottom:1px solid rgba(255,255,255,0.1); cursor:pointer; transition:background 0.2s;" 
                         onmouseenter="this.style.background='rgba(34, 211, 238, 0.1)'" 
                         onmouseleave="this.style.background='transparent'"
                         onclick="window.commitSchedule('${qsl}', '${name}', '${dateStr}', '${timeStr}')">
                        <strong style="color:white; font-size:16px;">${name}</strong><br>
                        <span style="color:var(--text-muted); font-size:12px;">DPI: ${data.id_identificacion || 'N/A'} | Tel: ${data.telefono || 'N/A'}</span>
                    </div>
                `;
            });
        }
        selectHtml += '</div>';

        const mainOverlay = document.createElement('div');
        mainOverlay.id = 'scheduler-search-modal';
        mainOverlay.style.position = 'fixed';
        mainOverlay.style.top = '0';
        mainOverlay.style.left = '0';
        mainOverlay.style.width = '100%';
        mainOverlay.style.height = '100%';
        mainOverlay.style.background = 'rgba(0,0,0,0.85)';
        mainOverlay.style.display = 'flex';
        mainOverlay.style.alignItems = 'center';
        mainOverlay.style.justifyContent = 'center';
        mainOverlay.style.zIndex = '99999';

        mainOverlay.innerHTML = `
            <div class="widget-card animate-in" style="background: #0f172a; padding: 40px; border-radius: 24px; border: 2px solid rgba(16, 185, 129, 0.4); text-align: center; max-width: 500px; width:100%;">
                <h3 style="color: white; font-size: 24px; margin-bottom: 20px;">Seleccione al Paciente</h3>
                ${selectHtml}
                <button onclick="document.body.removeChild(document.getElementById('scheduler-search-modal'))" style="margin-top:20px; background: none; border: none; font-size: 14px; text-decoration: underline; color: rgba(255,255,255,0.5); cursor: pointer;">Cancelar</button>
            </div>
        `;
        document.body.appendChild(mainOverlay);
    };

    window.scheduleNewPatient = function(dateStr, timeStr) {
        document.body.removeChild(document.getElementById('scheduler-modal'));
        
        // Save the pending scheduling intent into localStorage temporarily
        localStorage.setItem('pending_schedule_intent', JSON.stringify({date: dateStr, time: timeStr}));
        
        // Go to registration
        window.renderDoctorHome('register');
        window.showElegantAlert('Agendar Cita', 'Llene los datos del paciente nuevo. La cita quedará agendada al terminar automáticamente.');
    };

    window.commitSchedule = function(qsl, name, dateStr, timeStr) {
        const modal = document.getElementById('scheduler-search-modal');
        if(modal) document.body.removeChild(modal);
        
        window.saveAppointment({ qsl: qsl, name: name, date: dateStr, time: timeStr });
        window.showElegantAlert('Cita Programada', `Cita guardada para ${name} el día ${dateStr} a las ${timeStr}`);
        
        // Refresh the detail or scheduler (if we were in day detail, re-render it)
        window.renderDayDetail(dateStr);
        // Refresh overall right sidebar indirectly by just letting it render on view switch, but renderDayDetail doesn't reload the whole UI.
        // For simplicity, just renderScheduler and then optionally open renderDayDetail or just go to month view.
        window.renderScheduler();
        setTimeout(() => window.renderDayDetail(dateStr), 200);
    };

    /* End of Scheduler logic */

"""

# Inject before window.renderSection definition so it works well.
# There is `function renderSection(name, data)` globally.
idx = text.find("function renderSection(name, data)")
text = text[:idx] + scheduler_code + text[idx:]


with open("dashboard.js", "w") as f:
    f.write(text)

print("done")
