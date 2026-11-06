package com.tandem.api.repo.jpa;

import org.aopalliance.intercept.MethodInterceptor;
import org.springframework.aop.support.StaticMethodMatcherPointcutAdvisor;
import org.springframework.stereotype.Component;
import org.springframework.util.ClassUtils;

import java.lang.reflect.Method;

/** Wraps transaction begin/commit as well as adapter code in the port error contract. */
@Component
public class RepositoryExceptionAdvisor extends StaticMethodMatcherPointcutAdvisor {
    public RepositoryExceptionAdvisor() {
        setOrder(-100);
        setAdvice(
                (MethodInterceptor)
                        invocation -> {
                            try {
                                return invocation.proceed();
                            } catch (RuntimeException failure) {
                                throw PersistenceGuard.translate(failure);
                            }
                        });
    }

    @Override
    public boolean matches(Method method, Class<?> targetClass) {
        return targetClass.getPackageName().startsWith("com.tandem.api.repo.")
                && ClassUtils.getAllInterfacesForClassAsSet(targetClass).stream()
                        .anyMatch(
                                type ->
                                        type.getPackageName().equals("com.tandem.api.service.port")
                                                && type.getSimpleName().endsWith("Repository"));
    }
}
