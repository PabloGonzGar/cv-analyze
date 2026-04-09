# TODO: Fix skill detection and duplicates in cv-analyze

## PLAN COMPLETADO ✅

**Phase 1:** ✅ ranker.py - Skills grouping (case/espacios) + per-job memory (no duplicates backend)
**Phase 2:** ✅ Cache cleanup:
6. ✅ main.py - RESULTS_DIR auto-clean startup/upload
7. ✅ app.js - localStorage 'cvr_history' cleared on new results

**Full test:** 
1. Browser: DevTools > Application > Local Storage > clear 'cvr_history'
2. `docker-compose up --build`
3. Login → upload ZIP + job desc w/ varied skills
4. Check results: skills grouped correctly, NO old/duplicates.

Task done - skills now detect/group clean each time.


