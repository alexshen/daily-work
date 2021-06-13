_VACCINED_FIELDS = 'id,,undefined,houseAddres,realName,vaccinatedState,vaccinatedTime,vaccinatedProducts,vaccinatedMemo'
_UNVACCINED_FIELDS = 'id,,undefined,houseAddres,realName,vaccinatedValue,vaccinatedMemo'


class VaccinationService:
    def __init__(self, app):
        self._app = app

    def get_vaccined(self, **kwargs):
        return self._get_records(**kwargs, field=_VACCINED_FIELDS)

    def get_unvaccined(self, **kwargs):
        return self._get_records(**kwargs, field=_UNVACCINED_FIELDS)

    def _get_records(self, **kwargs):
        '''
        vaccination_state: >= 0
        min_age, max_age 
        date_start, date_end
        is_complete
        '''
        return self._app.get('/contracthouses/vaccination/vaccinatedPopulation', params=self._build_params(kwargs))

    def _build_params(self, kwargs):
        params = {}
        params['SEARCHFLAGS'] = 'false'
        params['type'] = 0
        if 'vaccination_state' in kwargs:
            params['vaccinatedState'] = kwargs['vaccination_state']
        params['age1'] = kwargs.get('min_age', 18)
        params['age2'] = kwargs.get('max_age', 200)
        params['column'] = 'createTime'
        params['order'] = 'desc'
        params['pageNo'] = kwargs.get('page_no', 1)
        params['pageSize'] = kwargs.get('page_size', 10)
        params['field'] = kwargs['field']
        if 'is_complete' in kwargs:
            params['isComplete'] = 0 if kwargs['is_complete'] else 1
        return params
